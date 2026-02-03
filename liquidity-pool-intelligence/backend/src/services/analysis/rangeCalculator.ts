import { Decimal } from 'decimal.js';
import { PoolData, PoolRangeData, RangeType } from '../../types/pool.js';
import { RiskProfile, riskProfileConfigs } from '../../types/settings.js';
import { networks } from '../../config/networks.js';
import {
  calculateRangeBounds,
  calculateTimeInRange,
  estimateDailyFees,
  calculateImpermanentLoss,
  calculateRangeScore,
  priceToTick,
  roundTickToSpacing,
} from '../../utils/math.js';
import { log } from '../../utils/logger.js';
import { prisma } from '../../database/client.js';

// ========================================
// CALCULADOR DE RANGES
// ========================================

// Calcula ranges para uma pool baseado no perfil de risco
export async function calculateRanges(
  pool: PoolData,
  riskProfile: RiskProfile
): Promise<PoolRangeData[]> {
  const operation = log.startOperation('Calculate ranges', {
    poolId: pool.id,
    riskProfile,
  });

  const profileConfig = riskProfileConfigs[riskProfile];
  const ranges: PoolRangeData[] = [];

  // Busca configurações do usuário
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    throw new Error('Settings not found');
  }

  const bankroll = new Decimal(settings.totalBankroll.toString());

  // Calcula cada tipo de range
  const rangeTypes: { type: RangeType; width: number }[] = [
    { type: 'DEFENSIVE', width: profileConfig.defensiveRangeWidth },
    { type: 'OPTIMIZED', width: profileConfig.optimizedRangeWidth },
    { type: 'AGGRESSIVE', width: profileConfig.aggressiveRangeWidth },
  ];

  for (const { type, width } of rangeTypes) {
    try {
      const range = calculateSingleRange(pool, type, width, bankroll, profileConfig);
      if (range) {
        ranges.push(range);
      }
    } catch (error) {
      log.warn(`Failed to calculate ${type} range for pool ${pool.id}`, { error });
    }
  }

  // Salva ranges no banco
  for (const range of ranges) {
    await saveRange(range);
  }

  operation.success(`Calculated ${ranges.length} ranges`);
  return ranges;
}

// Calcula um range específico
function calculateSingleRange(
  pool: PoolData,
  rangeType: RangeType,
  widthPercent: number,
  bankroll: Decimal,
  profileConfig: typeof riskProfileConfigs.NORMAL
): PoolRangeData | null {
  // Calcula limites do range
  const { lower: priceLower, upper: priceUpper } = calculateRangeBounds(
    pool.currentPrice,
    widthPercent
  );

  // Converte para ticks
  const tickLower = roundTickToSpacing(
    priceToTick(priceLower, pool.token0.decimals, pool.token1.decimals),
    pool.feeTier
  );
  const tickUpper = roundTickToSpacing(
    priceToTick(priceUpper, pool.token0.decimals, pool.token1.decimals),
    pool.feeTier
  );

  // Calcula tempo no range (usando histórico se disponível)
  let timeInRange7d = new Decimal(85); // Default otimista
  if (pool.priceHistory && pool.priceHistory.length > 0) {
    timeInRange7d = calculateTimeInRange(pool.priceHistory, priceLower, priceUpper);
  }

  // Se tempo no range for muito baixo, descarta
  if (timeInRange7d.lt(profileConfig.minTimeInRangeRequired)) {
    return null;
  }

  // Estima fees diárias
  const rangeWidthDecimal = new Decimal(widthPercent);
  const estimatedCapital = bankroll.mul(profileConfig.maxPositionSize).div(100);

  const dailyFees = estimateDailyFees(
    pool.volume24hUsd,
    pool.tvlUsd,
    pool.feeTier,
    estimatedCapital,
    rangeWidthDecimal
  );

  // Fees em 7 dias como % do capital
  const feesEstimate7d = dailyFees.mul(7).div(estimatedCapital).mul(100);

  // Estima IL
  // Simula cenário onde preço move até a borda do range
  const ilEstimate7d = calculateImpermanentLoss(
    pool.currentPrice,
    priceUpper, // Assume movimento até a borda
    priceLower,
    priceUpper
  ).mul(100);

  // Estima custo de gas
  const networkConfig = networks[pool.network];
  const gasEstimate = estimateGasCost(pool.network, networkConfig);

  // Calcula retorno líquido
  const gasAsPercent = gasEstimate.div(estimatedCapital).mul(100);
  const netReturn7d = feesEstimate7d.sub(ilEstimate7d).sub(gasAsPercent);

  // Determina nível de risco
  const riskLevel = determineRiskLevel(ilEstimate7d, timeInRange7d, pool.pairType);

  // Calcula score
  const score = calculateRangeScore(
    netReturn7d,
    timeInRange7d,
    pool.tvlUsd,
    ilEstimate7d,
    profileConfig.profile
  );

  // Calcula capital sugerido
  const { capitalPercent, capitalUsd } = calculateCapitalSuggestion(
    pool,
    netReturn7d,
    riskLevel,
    bankroll,
    profileConfig
  );

  // Gera explicação
  const explanation = generateExplanation(
    rangeType,
    widthPercent,
    feesEstimate7d,
    ilEstimate7d,
    timeInRange7d,
    riskLevel,
    pool
  );

  return {
    poolId: pool.id,
    rangeType,
    priceLower,
    priceUpper,
    tickLower,
    tickUpper,
    metrics: {
      score,
      feesEstimate7d,
      ilEstimate7d,
      gasEstimate,
      netReturn7d,
      timeInRange7d,
      riskLevel,
    },
    capitalSuggestion: {
      percentOfBankroll: capitalPercent,
      amountUsd: capitalUsd,
      reason: `Baseado no perfil ${profileConfig.profile} e risco ${riskLevel}`,
    },
    explanation,
  };
}

// Estima custo de gas para abrir posição
function estimateGasCost(network: string, networkConfig: typeof networks.ethereum): Decimal {
  // Gas units × gas price (gwei) × ETH price
  // Simplificado: usamos valores médios
  const gasUnits = networkConfig.gasEstimates.mintPosition;
  const gasPriceGwei = networkConfig.gasEstimates.avgGasPrice;

  // Assumindo ETH = $3000 (será atualizado com preço real em produção)
  const ethPriceUsd = 3000;

  const gasCostEth = (gasUnits * gasPriceGwei) / 1e9;
  const gasCostUsd = gasCostEth * ethPriceUsd;

  return new Decimal(gasCostUsd);
}

// Determina nível de risco
function determineRiskLevel(
  ilEstimate: Decimal,
  timeInRange: Decimal,
  pairType: string
): 'low' | 'medium' | 'high' {
  // Alta IL ou baixo tempo no range = alto risco
  if (ilEstimate.gt(5) || timeInRange.lt(60)) {
    return 'high';
  }

  // Par volátil ou IL moderada = risco médio
  if (pairType === 'altcoin_stable' || ilEstimate.gt(2) || timeInRange.lt(80)) {
    return 'medium';
  }

  return 'low';
}

// Calcula sugestão de capital
function calculateCapitalSuggestion(
  pool: PoolData,
  netReturn: Decimal,
  riskLevel: 'low' | 'medium' | 'high',
  bankroll: Decimal,
  profileConfig: typeof riskProfileConfigs.NORMAL
): { capitalPercent: Decimal; capitalUsd: Decimal } {
  // Começa com máximo permitido pelo perfil
  let capitalPercent = new Decimal(profileConfig.maxPositionSize);

  // Reduz baseado no risco
  if (riskLevel === 'high') {
    capitalPercent = capitalPercent.mul(0.5);
  } else if (riskLevel === 'medium') {
    capitalPercent = capitalPercent.mul(0.75);
  }

  // Reduz se retorno for negativo ou muito baixo
  if (netReturn.lte(0)) {
    capitalPercent = new Decimal(0);
  } else if (netReturn.lt(1)) {
    capitalPercent = capitalPercent.mul(0.5);
  }

  // Não recomenda se TVL for muito baixo
  if (pool.tvlUsd.lt(100000)) {
    capitalPercent = Decimal.min(capitalPercent, new Decimal(2));
  }

  const capitalUsd = bankroll.mul(capitalPercent).div(100);

  return { capitalPercent, capitalUsd };
}

// Gera explicação em linguagem humana
function generateExplanation(
  rangeType: RangeType,
  widthPercent: number,
  feesEstimate: Decimal,
  ilEstimate: Decimal,
  timeInRange: Decimal,
  riskLevel: 'low' | 'medium' | 'high',
  pool: PoolData
): string {
  const typeDescriptions: Record<RangeType, string> = {
    DEFENSIVE: 'Range defensivo (mais largo)',
    OPTIMIZED: 'Range otimizado (equilibrado)',
    AGGRESSIVE: 'Range agressivo (mais estreito)',
  };

  const riskDescriptions: Record<string, string> = {
    low: 'Risco baixo - adequado para capital que você não quer perder.',
    medium: 'Risco médio - balance entre retorno e segurança.',
    high: 'Risco alto - apenas para capital que você pode perder.',
  };

  let explanation = `${typeDescriptions[rangeType]}: ±${(widthPercent / 2).toFixed(1)}% do preço atual.\n\n`;

  explanation += `📊 **Projeção para 7 dias:**\n`;
  explanation += `• Fees estimadas: ${feesEstimate.toFixed(2)}% do capital\n`;
  explanation += `• IL estimada: ${ilEstimate.toFixed(2)}% do capital\n`;
  explanation += `• Tempo no range: ${timeInRange.toFixed(0)}% do tempo\n\n`;

  explanation += `⚠️ **Risco:** ${riskDescriptions[riskLevel]}\n\n`;

  // Adiciona contexto específico do par
  if (pool.pairType === 'stable_stable') {
    explanation += `💡 Par estável/estável - volatilidade muito baixa, ideal para ranges estreitos.`;
  } else if (pool.pairType === 'bluechip_stable') {
    explanation += `💡 Par bluechip/estável - volatilidade moderada, bom equilíbrio entre fees e risco.`;
  } else {
    explanation += `💡 Par volátil - considere ranges mais largos ou menor capital.`;
  }

  return explanation;
}

// Salva range no banco
async function saveRange(range: PoolRangeData): Promise<void> {
  try {
    await prisma.poolRange.upsert({
      where: {
        poolId_rangeType: {
          poolId: range.poolId,
          rangeType: range.rangeType,
        },
      },
      update: {
        priceLower: range.priceLower,
        priceUpper: range.priceUpper,
        tickLower: range.tickLower,
        tickUpper: range.tickUpper,
        score: range.metrics.score,
        feesEstimate7d: range.metrics.feesEstimate7d,
        ilEstimate7d: range.metrics.ilEstimate7d,
        gasEstimate: range.metrics.gasEstimate,
        netReturn7d: range.metrics.netReturn7d,
        timeInRange7d: range.metrics.timeInRange7d,
        capitalPercent: range.capitalSuggestion.percentOfBankroll,
        capitalUsd: range.capitalSuggestion.amountUsd,
        riskLevel: range.metrics.riskLevel,
        explanation: range.explanation,
        updatedAt: new Date(),
      },
      create: {
        poolId: range.poolId,
        rangeType: range.rangeType,
        priceLower: range.priceLower,
        priceUpper: range.priceUpper,
        tickLower: range.tickLower,
        tickUpper: range.tickUpper,
        score: range.metrics.score,
        feesEstimate7d: range.metrics.feesEstimate7d,
        ilEstimate7d: range.metrics.ilEstimate7d,
        gasEstimate: range.metrics.gasEstimate,
        netReturn7d: range.metrics.netReturn7d,
        timeInRange7d: range.metrics.timeInRange7d,
        capitalPercent: range.capitalSuggestion.percentOfBankroll,
        capitalUsd: range.capitalSuggestion.amountUsd,
        riskLevel: range.metrics.riskLevel,
        explanation: range.explanation,
      },
    });
  } catch (error) {
    log.warn(`Failed to save range for pool ${range.poolId}`, { error });
  }
}
