import { Decimal } from 'decimal.js';
import { prisma } from '../../database/client.js';
import { PoolData, RecommendedPool } from '../../types/pool.js';
import { PositionData } from '../../types/position.js';
import { RiskProfile, riskProfileConfigs } from '../../types/settings.js';
import { log } from '../../utils/logger.js';

// ========================================
// MOTOR DE RISCO
// ========================================

export interface RiskAssessment {
  allowed: boolean;
  warnings: string[];
  errors: string[];
  adjustedCapital?: Decimal;
  reason?: string;
}

export interface PortfolioRisk {
  totalExposure: Decimal;
  exposureByNetwork: Map<string, Decimal>;
  exposureByPairType: Map<string, Decimal>;
  volatileExposure: Decimal;
  concentrationRisk: 'low' | 'medium' | 'high';
  recommendations: string[];
}

// Avalia se uma nova posição é permitida
export async function assessPositionRisk(
  pool: PoolData,
  capitalUsd: Decimal
): Promise<RiskAssessment> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    return {
      allowed: false,
      warnings: [],
      errors: ['Configurações não encontradas'],
    };
  }

  const profileConfig = riskProfileConfigs[settings.riskProfile as RiskProfile];
  const bankroll = new Decimal(settings.totalBankroll.toString());

  const warnings: string[] = [];
  const errors: string[] = [];
  let adjustedCapital = capitalUsd;

  // 1. Verifica limite por pool
  const maxPerPool = bankroll.mul(settings.maxPercentPerPool).div(100);
  if (capitalUsd.gt(maxPerPool)) {
    warnings.push(
      `Capital excede limite por pool (${settings.maxPercentPerPool}%). Ajustado para ${maxPerPool.toFixed(2)} USDT.`
    );
    adjustedCapital = maxPerPool;
  }

  // 2. Verifica exposição atual por rede
  const currentPositions = await prisma.position.findMany({
    where: { status: 'ACTIVE' },
    include: { pool: true },
  });

  const networkExposure = new Map<string, Decimal>();
  for (const pos of currentPositions) {
    const network = pos.pool.network;
    const current = networkExposure.get(network) || new Decimal(0);
    networkExposure.set(network, current.add(new Decimal(pos.capitalUsd.toString())));
  }

  const currentNetworkExposure = networkExposure.get(pool.network) || new Decimal(0);
  const newNetworkExposure = currentNetworkExposure.add(adjustedCapital);
  const maxPerNetwork = bankroll.mul(settings.maxPercentPerNetwork).div(100);

  if (newNetworkExposure.gt(maxPerNetwork)) {
    const available = maxPerNetwork.sub(currentNetworkExposure);
    if (available.lte(0)) {
      errors.push(
        `Limite de exposição na rede ${pool.network} atingido (${settings.maxPercentPerNetwork}%).`
      );
    } else {
      warnings.push(
        `Exposição na rede ${pool.network} limitada. Capital ajustado para ${available.toFixed(2)} USDT.`
      );
      adjustedCapital = Decimal.min(adjustedCapital, available);
    }
  }

  // 3. Verifica exposição em pares voláteis
  if (pool.pairType === 'altcoin_stable' || pool.pairType === 'other') {
    let volatileExposure = new Decimal(0);
    for (const pos of currentPositions) {
      if (pos.pool.pairType === 'altcoin_stable' || pos.pool.pairType === 'other') {
        volatileExposure = volatileExposure.add(new Decimal(pos.capitalUsd.toString()));
      }
    }

    const newVolatileExposure = volatileExposure.add(adjustedCapital);
    const maxVolatile = bankroll.mul(settings.maxPercentVolatile).div(100);

    if (newVolatileExposure.gt(maxVolatile)) {
      const available = maxVolatile.sub(volatileExposure);
      if (available.lte(0)) {
        errors.push(
          `Limite de exposição em pares voláteis atingido (${settings.maxPercentVolatile}%).`
        );
      } else {
        warnings.push(
          `Exposição em pares voláteis limitada. Capital ajustado para ${available.toFixed(2)} USDT.`
        );
        adjustedCapital = Decimal.min(adjustedCapital, available);
      }
    }
  }

  // 4. Verifica TVL mínimo
  if (pool.tvlUsd.lt(100000)) {
    warnings.push('Pool com TVL baixo (<$100k). Risco de slippage elevado.');
  }

  // 5. Verifica se o capital mínimo faz sentido
  if (adjustedCapital.lt(50)) {
    errors.push('Capital muito baixo. Mínimo recomendado: $50.');
  }

  // 6. Verifica se o gas não come o lucro
  // (simplificado - em produção, usar estimativa real de gas)
  const estimatedGas = pool.network === 'ethereum' ? 50 : 2;
  if (adjustedCapital.lt(estimatedGas * 10)) {
    warnings.push(
      `Capital baixo em relação ao custo de gas (~$${estimatedGas}). Considere aumentar.`
    );
  }

  const allowed = errors.length === 0 && adjustedCapital.gt(0);

  return {
    allowed,
    warnings,
    errors,
    adjustedCapital: allowed ? adjustedCapital : undefined,
    reason: allowed
      ? `Posição aprovada com ${adjustedCapital.toFixed(2)} USDT`
      : errors.join(' '),
  };
}

// Avalia risco geral do portfólio
export async function assessPortfolioRisk(): Promise<PortfolioRisk> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    throw new Error('Settings not found');
  }

  const bankroll = new Decimal(settings.totalBankroll.toString());

  const positions = await prisma.position.findMany({
    where: { status: 'ACTIVE' },
    include: { pool: true },
  });

  // Calcula exposições
  let totalExposure = new Decimal(0);
  const exposureByNetwork = new Map<string, Decimal>();
  const exposureByPairType = new Map<string, Decimal>();
  let volatileExposure = new Decimal(0);

  for (const pos of positions) {
    const capital = new Decimal(pos.capitalUsd.toString());
    totalExposure = totalExposure.add(capital);

    // Por rede
    const network = pos.pool.network;
    const currentNetwork = exposureByNetwork.get(network) || new Decimal(0);
    exposureByNetwork.set(network, currentNetwork.add(capital));

    // Por tipo de par
    const pairType = pos.pool.pairType;
    const currentPairType = exposureByPairType.get(pairType) || new Decimal(0);
    exposureByPairType.set(pairType, currentPairType.add(capital));

    // Volátil
    if (pairType === 'altcoin_stable' || pairType === 'other') {
      volatileExposure = volatileExposure.add(capital);
    }
  }

  // Avalia concentração
  let concentrationRisk: 'low' | 'medium' | 'high' = 'low';
  const recommendations: string[] = [];

  // Verifica concentração em uma única rede
  for (const [network, exposure] of exposureByNetwork) {
    const percent = exposure.div(bankroll).mul(100);
    if (percent.gt(40)) {
      concentrationRisk = 'high';
      recommendations.push(
        `Alta concentração em ${network} (${percent.toFixed(1)}%). Considere diversificar.`
      );
    } else if (percent.gt(30)) {
      if (concentrationRisk === 'low') concentrationRisk = 'medium';
      recommendations.push(
        `Concentração moderada em ${network} (${percent.toFixed(1)}%).`
      );
    }
  }

  // Verifica exposição total
  const totalPercent = totalExposure.div(bankroll).mul(100);
  if (totalPercent.gt(80)) {
    if (concentrationRisk === 'low') concentrationRisk = 'medium';
    recommendations.push(
      `Alta exposição total (${totalPercent.toFixed(1)}% da banca). Mantenha reserva.`
    );
  }

  // Verifica diversificação
  if (exposureByPairType.size === 1 && totalExposure.gt(0)) {
    recommendations.push(
      'Todas as posições são do mesmo tipo de par. Considere diversificar.'
    );
  }

  // Verifica se tem exposição em voláteis adequada ao perfil
  const volatilePercent = volatileExposure.div(bankroll).mul(100);
  const maxVolatile = new Decimal(settings.maxPercentVolatile.toString());
  if (volatilePercent.gt(maxVolatile)) {
    concentrationRisk = 'high';
    recommendations.push(
      `Exposição em voláteis (${volatilePercent.toFixed(1)}%) excede limite (${maxVolatile.toFixed(1)}%).`
    );
  }

  return {
    totalExposure,
    exposureByNetwork,
    exposureByPairType,
    volatileExposure,
    concentrationRisk,
    recommendations,
  };
}

// Verifica se deve recomendar NÃO operar
export async function shouldRecommendNoOperation(
  recommendations: RecommendedPool[]
): Promise<{ recommend: boolean; reason: string }> {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    return { recommend: true, reason: 'Configurações não encontradas' };
  }

  const profileConfig = riskProfileConfigs[settings.riskProfile as RiskProfile];

  // Filtra recomendações com score mínimo
  const validRecommendations = recommendations.filter(
    r => r.overallScore >= profileConfig.minScoreForRecommendation
  );

  if (validRecommendations.length === 0) {
    return {
      recommend: true,
      reason: `Nenhuma pool atende ao score mínimo (${profileConfig.minScoreForRecommendation}) para o perfil ${settings.riskProfile}. Melhor não prover liquidez agora.`,
    };
  }

  // Verifica se todas as recomendações têm retorno negativo
  const allNegativeReturn = validRecommendations.every(
    r => r.bestRange.metrics.netReturn7d.lte(0)
  );

  if (allNegativeReturn) {
    return {
      recommend: true,
      reason: 'Todas as pools elegíveis têm retorno líquido negativo projetado. Melhor aguardar melhores condições de mercado.',
    };
  }

  return { recommend: false, reason: '' };
}

// Log de decisão para histórico
export async function logRiskDecision(
  poolId: string,
  decision: 'APPROVED' | 'REJECTED' | 'ADJUSTED',
  originalCapital: Decimal,
  finalCapital: Decimal | null,
  reason: string
): Promise<void> {
  try {
    await prisma.historyEntry.create({
      data: {
        poolId,
        action: 'RISK_ASSESSMENT',
        details: {
          decision,
          originalCapital: originalCapital.toString(),
          finalCapital: finalCapital?.toString() || null,
          reason,
          timestamp: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    log.warn('Failed to log risk decision', { error, poolId });
  }
}
