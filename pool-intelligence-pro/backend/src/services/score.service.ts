import { Pool, PoolWithMetrics, Score, ScoreBreakdown, Mode } from '../types/index.js';
import { config } from '../config/index.js';
import { logService } from './log.service.js';
import { memoryStore } from './memory-store.service.js';
import { riskService } from './risk.service.js';

interface ScoreWeights {
  health: number;
  return: number;
  risk: number;
}

interface ModeThresholds {
  volatilityMax: number;
  minLiquidity: number;
  minVolume: number;
}

const MODE_THRESHOLDS: Record<Mode, ModeThresholds> = {
  DEFENSIVE: {
    volatilityMax: 5,
    minLiquidity: 500000,
    minVolume: 50000,
  },
  NORMAL: {
    volatilityMax: 15,
    minLiquidity: 100000,
    minVolume: 10000,
  },
  AGGRESSIVE: {
    volatilityMax: 30,
    minLiquidity: 50000,
    minVolume: 5000,
  },
};

// Pesos por modo: health + return = 100 (score máximo teórico = 100)
// DEFENSIVE: prioriza saúde/estabilidade, penaliza risco fortemente
// NORMAL: balanceado
// AGGRESSIVE: prioriza retorno, tolera mais risco
const MODE_WEIGHTS: Record<Mode, ScoreWeights> = {
  DEFENSIVE:  { health: 60, return: 40, risk: 35 },
  NORMAL:     { health: 55, return: 45, risk: 25 },
  AGGRESSIVE: { health: 45, return: 55, risk: 15 },
};

export class ScoreService {
  private weights: ScoreWeights;

  constructor(weights?: Partial<ScoreWeights>) {
    this.weights = {
      health: weights?.health || config.scoreWeights.health,
      return: weights?.return || config.scoreWeights.return,
      risk: weights?.risk || config.scoreWeights.risk,
    };
  }

  calculateScore(pool: Pool, metrics?: PoolWithMetrics['metrics'], mode: Mode = 'NORMAL'): Score {
    try {
      // Pesos ajustados por modo: DEFENSIVE=estabilidade, AGGRESSIVE=retorno
      const modeWeights = MODE_WEIGHTS[mode];
      const breakdown = this.calculateBreakdown(pool, metrics, mode);

      // Calculate component scores usando pesos do modo
      const healthScore = this.calculateHealthScore(breakdown.health, modeWeights.health);
      const returnScore = this.calculateReturnScore(breakdown.return, modeWeights.return);
      const riskPenalty = this.calculateRiskPenalty(breakdown.risk, modeWeights.risk);

      // Total score
      const total = Math.max(0, Math.min(100, healthScore + returnScore - riskPenalty));

      // Determine recommended mode
      const recommendedMode = this.determineMode(pool, metrics, total);

      // Avaliar risco via RiskService (Fase 4) + flags de domínio locais
      const riskAssessment = riskService.assessPool(pool);
      const suspectFlags = this.checkSuspect(pool, metrics, breakdown, mode);
      const isSuspect = riskAssessment.level === 'HIGH' || riskAssessment.level === 'CRITICAL' || suspectFlags.isSuspect;
      // Preferir razão de domínio quando disponível; fallback para summary do risk service
      const suspectReason = suspectFlags.suspectReason ?? (riskAssessment.factors.length > 0 ? riskAssessment.summary : undefined);

      return {
        total: Math.round(total * 10) / 10,
        health: Math.round(healthScore * 10) / 10,
        return: Math.round(returnScore * 10) / 10,
        risk: Math.round(riskPenalty * 10) / 10,
        breakdown,
        recommendedMode,
        isSuspect,
        suspectReason,
      };
    } catch (error) {
      logService.error('SCORE', 'Failed to calculate score', { pool: pool.externalId, error });

      return {
        total: 0,
        health: 0,
        return: 0,
        risk: 0,
        breakdown: this.emptyBreakdown(),
        recommendedMode: 'DEFENSIVE',
        isSuspect: true,
        suspectReason: 'Calculation error',
      };
    }
  }

  private calculateBreakdown(pool: Pool, metrics?: PoolWithMetrics['metrics'], mode: Mode = 'NORMAL'): ScoreBreakdown {
    // Use pool.volatilityAnn for volatility penalty (if available from enrichment)
    const volatility24h = metrics?.volatility24h ?? (pool.volatilityAnn ? pool.volatilityAnn * 100 : undefined);

    return {
      health: {
        // Liquidity stability (higher = better)
        liquidityStability: this.normalizeLiquidity(pool.tvl),
        // Age score: estimated from maturity signals (high TVL + consistent volume = mature)
        ageScore: this.estimateAgeScore(pool),
        // Volume consistency (volume/TVL ratio)
        volumeConsistency: this.calculateVolumeConsistency(pool),
      },
      return: {
        // Volume to TVL ratio (efficiency)
        volumeTvlRatio: this.calculateVolumeTvlRatio(pool),
        // Fee efficiency
        feeEfficiency: this.calculateFeeEfficiency(pool),
        // APR estimate
        aprEstimate: pool.apr || this.estimateApr(pool),
      },
      risk: {
        // Volatility penalty — sensibilidade depende do perfil de risco
        volatilityPenalty: this.calculateVolatilityPenalty(volatility24h, mode),
        // Liquidity drop penalty (from TVL snapshots in MemoryStore)
        liquidityDropPenalty: this.calculateLiquidityDropPenalty(pool),
        // Inconsistency between sources (set by consensus when multiple providers)
        inconsistencyPenalty: 0,
        // Spread penalty (requires order book data — not available)
        spreadPenalty: 0,
      },
    };
  }

  private calculateHealthScore(health: ScoreBreakdown['health'], maxHealth?: number): number {
    const effectiveMax = maxHealth ?? this.weights.health;

    // Weight distribution within health
    const liquidityWeight = 0.4;
    const ageWeight = 0.2;
    const consistencyWeight = 0.4;

    return effectiveMax * (
      (health.liquidityStability / 100) * liquidityWeight +
      (health.ageScore / 100) * ageWeight +
      (health.volumeConsistency / 100) * consistencyWeight
    );
  }

  private calculateReturnScore(returnData: ScoreBreakdown['return'], maxReturn?: number): number {
    const effectiveMax = maxReturn ?? this.weights.return;

    // Weight distribution
    const volumeTvlWeight = 0.3;
    const feeWeight = 0.3;
    const aprWeight = 0.4;

    // Normalização logarítmica de APR: 10%→52, 50%→77, 100%→87, 200%→100
    // Evita que APR 500% e APR 100% deem o mesmo score (era: cap linear em 100)
    const aprNorm = Math.max(returnData.aprEstimate, 0.1);
    const normalizedApr = Math.min(
      (Math.log10(aprNorm) / Math.log10(200)) * 100,
      100
    );

    return effectiveMax * (
      (returnData.volumeTvlRatio / 100) * volumeTvlWeight +
      (returnData.feeEfficiency / 100) * feeWeight +
      (Math.max(0, normalizedApr) / 100) * aprWeight
    );
  }

  private calculateRiskPenalty(risk: ScoreBreakdown['risk'], maxPenalty?: number): number {
    const effectiveMax = maxPenalty ?? this.weights.risk;

    // Sum all penalties (capped at max)
    const totalPenalty =
      risk.volatilityPenalty +
      risk.liquidityDropPenalty +
      risk.inconsistencyPenalty +
      risk.spreadPenalty;

    return Math.min(totalPenalty, effectiveMax);
  }

  private normalizeLiquidity(tvl: number): number {
    // Score based on TVL tiers — calibrated for realistic DeFi pool sizes
    if (tvl >= 10000000) return 100;  // $10M+ = elite
    if (tvl >= 5000000) return 95;    // $5M+ = excellent
    if (tvl >= 1000000) return 85;    // $1M+ = very good
    if (tvl >= 500000) return 75;     // $500k+ = good
    if (tvl >= 250000) return 65;     // $250k+ = adequate
    if (tvl >= 100000) return 50;     // $100k+ = minimum viable
    if (tvl > 0) return 20;           // pequena mas existe
    return 0;                          // sem liquidez = zero
  }

  private calculateVolumeConsistency(pool: Pool): number {
    // Heuristic: daily volume relative to TVL indicates consistent trading activity
    if (pool.tvl === 0) return 0;
    const ratio = pool.volume24h / pool.tvl;

    // Calibrated for realistic DeFi: most healthy pools have 5-30% daily volume/TVL
    if (ratio >= 0.30) return 100;  // 30%+ = very high activity
    if (ratio >= 0.15) return 90;   // 15%+ = high activity
    if (ratio >= 0.05) return 75;   // 5%+ = healthy
    if (ratio >= 0.02) return 60;   // 2%+ = moderate
    if (ratio >= 0.005) return 40;  // 0.5%+ = low but present
    return 20;
  }

  private calculateVolumeTvlRatio(pool: Pool): number {
    if (pool.tvl === 0) return 0;
    const ratio = pool.volume24h / pool.tvl * 100; // ratio as percentage

    // Calibrated: typical healthy pools have 5-50% daily volume/TVL
    if (ratio >= 50) return 100;   // 50%+ = extremely efficient
    if (ratio >= 30) return 90;    // 30%+ = very efficient
    if (ratio >= 15) return 75;    // 15%+ = good efficiency
    if (ratio >= 5) return 60;     // 5%+ = adequate
    if (ratio >= 2) return 45;     // 2%+ = low but active
    return 25;
  }

  private calculateFeeEfficiency(pool: Pool): number {
    // If we have fees data
    if (pool.fees24h && pool.tvl > 0) {
      const feeRatio = pool.fees24h / pool.tvl * 365 * 100; // Annualized fee %
      // Calibrated: 5-20% annualized is typical for healthy pools
      if (feeRatio >= 50) return 100;
      if (feeRatio >= 25) return 85;
      if (feeRatio >= 10) return 70;
      if (feeRatio >= 5) return 55;
      if (feeRatio >= 2) return 40;
      return 25;
    }

    // Estimate from fee tier if available
    // feeTier is in decimal form: 0.003 = 0.3%
    if (pool.feeTier && pool.volume24h > 0 && pool.tvl > 0) {
      const dailyFees = pool.volume24h * pool.feeTier;
      const annualizedApr = (dailyFees * 365) / pool.tvl * 100;
      return Math.min(100, annualizedApr);
    }

    // Last resort: use pool.apr to derive fee efficiency
    if (pool.apr && pool.apr > 0) {
      return Math.min(100, pool.apr);
    }

    return 50; // No data available — neutral score (not pessimistic)
  }

  /**
   * Estimate pool age score from maturity signals.
   * Mature pools tend to have: high TVL, consistent volume, bluechip tokens.
   * Score: 0-100 (100 = very mature/established pool)
   */
  private estimateAgeScore(pool: Pool): number {
    let score = 10; // baseline conservador — pools precisam provar maturidade

    // High TVL signals established pool
    if (pool.tvl >= 10_000_000) score += 25;
    else if (pool.tvl >= 1_000_000) score += 20;
    else if (pool.tvl >= 500_000) score += 15;
    else if (pool.tvl >= 100_000) score += 10;

    // Consistent volume relative to TVL signals active, mature pool
    if (pool.tvl > 0 && pool.volume24h > 0) {
      const ratio = pool.volume24h / pool.tvl;
      if (ratio >= 0.05) score += 20;
      else if (ratio >= 0.01) score += 15;
      else if (ratio >= 0.005) score += 10;
    }

    // Bluechip tokens signal mature pool
    if (pool.bluechip) score += 20;

    return Math.min(100, score);
  }

  private estimateApr(pool: Pool): number {
    // Estimate APR from volume and typical fee
    // feeTier is in decimal form: 0.003 = 0.3%
    if (pool.tvl === 0) return 0;

    const assumedFeeRate = pool.feeTier || 0.003; // Default 0.3% = 0.003
    const dailyFees = pool.volume24h * assumedFeeRate;
    const annualizedApr = (dailyFees * 365) / pool.tvl * 100;

    return Math.round(annualizedApr * 10) / 10;
  }

  private calculateVolatilityPenalty(volatility?: number, mode: Mode = 'NORMAL'): number {
    if (!volatility) {
      // Sem dados: DEFENSIVE assume o pior, AGGRESSIVE tolera
      return mode === 'DEFENSIVE' ? 8 : mode === 'AGGRESSIVE' ? 0 : 2;
    }

    if (mode === 'DEFENSIVE') {
      // Muito sensível a volatilidade — ranges conservadores precisam de baixa vol
      if (volatility >= 25) return 32;
      if (volatility >= 15) return 25;
      if (volatility >= 10) return 18;
      if (volatility >= 5)  return 10;
      return 3;
    }

    if (mode === 'AGGRESSIVE') {
      // Tolerante a volatilidade — pode usar ranges mais largos
      if (volatility >= 60) return 12;
      if (volatility >= 40) return 8;
      if (volatility >= 30) return 5;
      if (volatility >= 20) return 2;
      return 0;
    }

    // NORMAL (comportamento anterior calibrado)
    if (volatility >= 30) return 25;
    if (volatility >= 20) return 20;
    if (volatility >= 10) return 12;
    if (volatility >= 5)  return 5;
    return 0;
  }

  private calculateLiquidityDropPenalty(pool: Pool): number {
    const poolId = `${pool.chain}_${pool.poolAddress}`;
    const dropPct = memoryStore.getTvlDrop(poolId);

    // No significant drop
    if (dropPct < 10) return 0;
    // 10-30% drop = moderate penalty
    if (dropPct < 30) return Math.round(dropPct * 0.5);
    // 30-50% drop = heavy penalty
    if (dropPct < 50) return Math.round(dropPct * 0.7);
    // >50% drop = severe penalty (likely rug or migration)
    return 25;
  }

  private determineMode(pool: Pool, metrics: PoolWithMetrics['metrics'] | undefined, score: number): Mode {
    const volatility = metrics?.volatility24h || 10;

    // AGGRESSIVE: score alto + vol MUITO baixa (≤5%) = range estreito seguro
    if (score >= 70 && volatility <= MODE_THRESHOLDS.DEFENSIVE.volatilityMax) {
      return 'AGGRESSIVE';
    }

    // NORMAL: score médio + vol controlada (≤15%)
    if (score >= 50 && volatility <= MODE_THRESHOLDS.NORMAL.volatilityMax) {
      return 'NORMAL';
    }

    // Default to defensive
    return 'DEFENSIVE';
  }

  private checkSuspect(
    pool: Pool,
    metrics: PoolWithMetrics['metrics'] | undefined,
    breakdown: ScoreBreakdown,
    mode: Mode = 'NORMAL'
  ): { isSuspect: boolean; suspectReason?: string } {
    const reasons: string[] = [];

    // Thresholds de liquidez e volume variam por perfil de risco
    const modeThresholds = MODE_THRESHOLDS[mode];
    const minLiquidity = Math.max(config.thresholds.minLiquidity, modeThresholds.minLiquidity);
    const minVolume = Math.max(config.thresholds.minVolume24h, modeThresholds.minVolume);

    if (pool.tvl < minLiquidity) {
      reasons.push('TVL below minimum threshold');
    }

    if (pool.volume24h < minVolume) {
      reasons.push('Volume below minimum threshold');
    }

    // Extremely high APR is suspicious
    if (pool.apr && pool.apr > 500) {
      reasons.push('Unusually high APR');
    }

    // Volume much higher than TVL is suspicious
    if (pool.volume24h > pool.tvl * 10) {
      reasons.push('Volume/TVL ratio too high');
    }

    if (breakdown.risk.inconsistencyPenalty > 15) {
      reasons.push('High data inconsistency between sources');
    }

    return {
      isSuspect: reasons.length > 0,
      suspectReason: reasons.length > 0 ? reasons.join('; ') : undefined,
    };
  }

  private emptyBreakdown(): ScoreBreakdown {
    return {
      health: { liquidityStability: 0, ageScore: 0, volumeConsistency: 0 },
      return: { volumeTvlRatio: 0, feeEfficiency: 0, aprEstimate: 0 },
      risk: { volatilityPenalty: 0, liquidityDropPenalty: 0, inconsistencyPenalty: 0, spreadPenalty: 0 },
    };
  }
}

export const scoreService = new ScoreService();
