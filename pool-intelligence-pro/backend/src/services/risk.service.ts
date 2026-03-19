import { Pool, RiskAssessment, RiskFactor, RiskLevel } from '../types/index.js';
import { memoryStore } from './memory-store.service.js';
import { logService } from './log.service.js';

// Stablecoins comuns — usados para dispensar check de preço ausente
const STABLECOIN_SYMBOLS = new Set([
  'USDC', 'USDT', 'DAI', 'BUSD', 'FRAX', 'TUSD', 'USDP', 'LUSD',
  'USDD', 'GUSD', 'SUSD', 'FDUSD', 'PYUSD', 'CRVUSD', 'GHO',
]);

function isStablecoin(symbol: string): boolean {
  return STABLECOIN_SYMBOLS.has(symbol.toUpperCase());
}

const SEVERITY_WEIGHTS: Record<RiskLevel, number> = {
  CRITICAL: 40,
  HIGH: 25,
  MEDIUM: 10,
  LOW: 5,
};

const LEVEL_ORDER: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export class RiskService {
  /**
   * Avalia o risco de operar em um pool.
   * Retorna um RiskAssessment com nível, score, fatores e recomendação.
   */
  assessPool(pool: Pool): RiskAssessment {
    try {
      const factors: RiskFactor[] = [];

      const honeypot = this.checkHoneypot(pool);
      if (honeypot) factors.push(honeypot);

      const washTrading = this.checkWashTrading(pool);
      if (washTrading) factors.push(washTrading);

      const tvlFlight = this.checkTvlFlight(pool);
      if (tvlFlight) factors.push(tvlFlight);

      const unrealisticApr = this.checkUnrealisticApr(pool);
      if (unrealisticApr) factors.push(unrealisticApr);

      const lowLiquidity = this.checkLowLiquidity(pool);
      if (lowLiquidity) factors.push(lowLiquidity);

      const priceMissing = this.checkPriceMissing(pool);
      if (priceMissing) factors.push(priceMissing);

      const level = this.aggregateLevel(factors);
      const score = this.calculateScore(factors);
      const shouldOperate = this.determineShouldOperate(level, factors);
      const summary = this.buildSummary(factors, level, shouldOperate);

      return { level, score, factors, shouldOperate, summary };
    } catch (error) {
      logService.error('SCORE', 'RiskService.assessPool failed', { pool: pool.externalId, error });

      return {
        level: 'HIGH',
        score: 50,
        factors: [{
          code: 'ASSESSMENT_ERROR',
          severity: 'HIGH',
          message: 'Erro interno ao avaliar risco do pool.',
        }],
        shouldOperate: false,
        summary: 'Erro ao avaliar risco. Operação não recomendada por precaução.',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Checks individuais
  // ---------------------------------------------------------------------------

  private checkHoneypot(pool: Pool): RiskFactor | null {
    const apr = pool.apr ?? 0;
    if (apr > 1000) {
      return {
        code: 'HONEYPOT_APR',
        severity: 'CRITICAL',
        message: `APR de ${apr.toFixed(0)}% é extremamente suspeito (possível honeypot).`,
      };
    }
    return null;
  }

  private checkWashTrading(pool: Pool): RiskFactor | null {
    if (pool.tvl <= 0) return null;

    const ratio = pool.volume24h / pool.tvl;

    if (ratio > 50) {
      return {
        code: 'WASH_TRADING',
        severity: 'HIGH',
        message: `Relação volume/TVL de ${ratio.toFixed(1)}x indica possível wash trading.`,
      };
    }

    if (ratio > 20) {
      return {
        code: 'WASH_TRADING',
        severity: 'MEDIUM',
        message: `Relação volume/TVL de ${ratio.toFixed(1)}x é elevada — verificar wash trading.`,
      };
    }

    return null;
  }

  private checkTvlFlight(pool: Pool): RiskFactor | null {
    const poolId = `${pool.chain}_${pool.poolAddress}`;
    const dropPct = memoryStore.getTvlDrop(poolId);

    if (dropPct > 50) {
      return {
        code: 'TVL_FLIGHT_CRITICAL',
        severity: 'CRITICAL',
        message: `TVL caiu ${dropPct.toFixed(1)}% — saída massiva de liquidez detectada.`,
      };
    }

    if (dropPct > 30) {
      return {
        code: 'TVL_FLIGHT_HIGH',
        severity: 'HIGH',
        message: `TVL caiu ${dropPct.toFixed(1)}% — fuga significativa de liquidez.`,
      };
    }

    return null;
  }

  private checkUnrealisticApr(pool: Pool): RiskFactor | null {
    const apr = pool.apr ?? 0;

    // checkHoneypot já cobre > 1000%; aqui cobrimos > 500% e > 200%
    if (apr > 1000) return null; // já tratado como HONEYPOT

    if (apr > 500) {
      return {
        code: 'UNREALISTIC_APR',
        severity: 'HIGH',
        message: `APR de ${apr.toFixed(0)}% é irrealista — alto risco de insustentabilidade.`,
      };
    }

    if (apr > 200) {
      return {
        code: 'UNREALISTIC_APR',
        severity: 'MEDIUM',
        message: `APR de ${apr.toFixed(0)}% é elevado — validar sustentabilidade.`,
      };
    }

    return null;
  }

  private checkLowLiquidity(pool: Pool): RiskFactor | null {
    if (pool.tvl < 10_000) {
      return {
        code: 'TVL_CRITICAL',
        severity: 'CRITICAL',
        message: `TVL de $${pool.tvl.toLocaleString('pt-BR')} está abaixo do mínimo crítico ($10k).`,
      };
    }

    if (pool.tvl < 50_000) {
      return {
        code: 'TVL_LOW',
        severity: 'HIGH',
        message: `TVL de $${pool.tvl.toLocaleString('pt-BR')} está abaixo do mínimo recomendado ($50k).`,
      };
    }

    return null;
  }

  private checkPriceMissing(pool: Pool): RiskFactor | null {
    const priceConf = pool.dataConfidence?.price;
    const pairIsStable =
      isStablecoin(pool.token0.symbol) && isStablecoin(pool.token1.symbol);

    // Não aplicar penalidade em pares stablecoin (preço = 1 implícito)
    if (pairIsStable) return null;

    const confidenceIsLow = priceConf?.confidence === 'low';
    const priceUnavailable =
      priceConf?.method === 'unavailable' ||
      (!pool.price && !pool.token0.priceUsd && !pool.token1.priceUsd);

    if (confidenceIsLow || priceUnavailable) {
      return {
        code: 'PRICE_UNRELIABLE',
        severity: 'MEDIUM',
        message: 'Dados de preço ausentes ou pouco confiáveis para este pool.',
      };
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Agregação
  // ---------------------------------------------------------------------------

  private aggregateLevel(factors: RiskFactor[]): RiskLevel {
    if (factors.length === 0) return 'LOW';

    return factors.reduce<RiskLevel>((highest, factor) => {
      return LEVEL_ORDER[factor.severity] > LEVEL_ORDER[highest]
        ? factor.severity
        : highest;
    }, 'LOW');
  }

  private calculateScore(factors: RiskFactor[]): number {
    const raw = factors.reduce((sum, f) => sum + SEVERITY_WEIGHTS[f.severity], 0);
    return Math.min(100, Math.max(0, raw));
  }

  private determineShouldOperate(level: RiskLevel, factors: RiskFactor[]): boolean {
    if (level === 'CRITICAL') return false;
    if (level === 'HIGH' && factors.length >= 2) return false;
    return true;
  }

  private buildSummary(
    factors: RiskFactor[],
    level: RiskLevel,
    shouldOperate: boolean
  ): string {
    if (factors.length === 0) {
      return 'Nenhum fator de risco identificado. Pool dentro dos parâmetros normais.';
    }

    const countBySeverity = factors.reduce<Record<RiskLevel, number>>(
      (acc, f) => { acc[f.severity]++; return acc; },
      { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 }
    );

    const parts: string[] = [];
    if (countBySeverity.CRITICAL > 0) parts.push(`${countBySeverity.CRITICAL} crítico${countBySeverity.CRITICAL > 1 ? 's' : ''}`);
    if (countBySeverity.HIGH > 0) parts.push(`${countBySeverity.HIGH} alto${countBySeverity.HIGH > 1 ? 's' : ''}`);
    if (countBySeverity.MEDIUM > 0) parts.push(`${countBySeverity.MEDIUM} médio${countBySeverity.MEDIUM > 1 ? 's' : ''}`);
    if (countBySeverity.LOW > 0) parts.push(`${countBySeverity.LOW} baixo${countBySeverity.LOW > 1 ? 's' : ''}`);

    const levelLabel: Record<RiskLevel, string> = {
      LOW: 'baixo',
      MEDIUM: 'médio',
      HIGH: 'alto',
      CRITICAL: 'crítico',
    };

    const severityDetail = parts.length > 0 ? ` (${parts.join(', ')})` : '';
    const operateLabel = shouldOperate
      ? 'Operar com cautela.'
      : 'Operação não recomendada.';

    return (
      `${factors.length} fator${factors.length > 1 ? 'es' : ''} de risco identificado${factors.length > 1 ? 's' : ''}${severityDetail}. ` +
      `Nível ${levelLabel[level]}. ${operateLabel}`
    );
  }
}

export const riskService = new RiskService();
