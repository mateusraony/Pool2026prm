import { Pool, PoolWithMetrics, Score, ScoreBreakdown, Mode } from '../types/index.js';
import { config } from '../config/index.js';
import { logService } from './log.service.js';

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

export class ScoreService {
  private weights: ScoreWeights;

  constructor(weights?: Partial<ScoreWeights>) {
    this.weights = {
      health: weights?.health || config.scoreWeights.health,
      return: weights?.return || config.scoreWeights.return,
      risk: weights?.risk || config.scoreWeights.risk,
    };
  }

  calculateScore(pool: Pool, metrics?: PoolWithMetrics['metrics']): Score {
    try {
      const breakdown = this.calculateBreakdown(pool, metrics);
      
      // Calculate component scores
      const healthScore = this.calculateHealthScore(breakdown.health);
      const returnScore = this.calculateReturnScore(breakdown.return);
      const riskPenalty = this.calculateRiskPenalty(breakdown.risk);
      
      // Total score
      const total = Math.max(0, Math.min(100, healthScore + returnScore - riskPenalty));
      
      // Determine recommended mode
      const recommendedMode = this.determineMode(pool, metrics, total);
      
      // Check for suspect conditions
      const { isSuspect, suspectReason } = this.checkSuspect(pool, metrics, breakdown);
      
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

  private calculateBreakdown(pool: Pool, metrics?: PoolWithMetrics['metrics']): ScoreBreakdown {
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
        // Volatility penalty (uses real volatilityAnn when available)
        volatilityPenalty: this.calculateVolatilityPenalty(volatility24h),
        // Liquidity drop penalty: detect TVL drop from peak (TheGraph poolHourData)
        liquidityDropPenalty: this.calculateLiquidityDropPenalty(pool),
        // Inconsistency between sources (set by consensus when multiple providers)
        inconsistencyPenalty: 0,
        // Spread penalty (requires order book data — not available from current APIs)
        spreadPenalty: 0,
      },
    };
  }

  private calculateHealthScore(health: ScoreBreakdown['health']): number {
    const maxHealth = this.weights.health;
    
    // Weight distribution within health
    const liquidityWeight = 0.4;
    const ageWeight = 0.2;
    const consistencyWeight = 0.4;
    
    return maxHealth * (
      (health.liquidityStability / 100) * liquidityWeight +
      (health.ageScore / 100) * ageWeight +
      (health.volumeConsistency / 100) * consistencyWeight
    );
  }

  private calculateReturnScore(returnData: ScoreBreakdown['return']): number {
    const maxReturn = this.weights.return;
    
    // Weight distribution
    const volumeTvlWeight = 0.3;
    const feeWeight = 0.3;
    const aprWeight = 0.4;
    
    // Normalize APR (cap at 100% for scoring)
    const normalizedApr = Math.min(returnData.aprEstimate, 100) / 100 * 100;
    
    return maxReturn * (
      (returnData.volumeTvlRatio / 100) * volumeTvlWeight +
      (returnData.feeEfficiency / 100) * feeWeight +
      (normalizedApr / 100) * aprWeight
    );
  }

  private calculateRiskPenalty(risk: ScoreBreakdown['risk']): number {
    const maxPenalty = this.weights.risk;
    
    // Sum all penalties (capped at max)
    const totalPenalty = 
      risk.volatilityPenalty +
      risk.liquidityDropPenalty +
      risk.inconsistencyPenalty +
      risk.spreadPenalty;
    
    return Math.min(totalPenalty, maxPenalty);
  }

  private normalizeLiquidity(tvl: number): number {
    // Score based on TVL tiers
    if (tvl >= 10000000) return 100;  // $10M+
    if (tvl >= 5000000) return 90;    // $5M+
    if (tvl >= 1000000) return 75;    // $1M+
    if (tvl >= 500000) return 60;     // $500k+
    if (tvl >= 100000) return 40;     // $100k+
    return 20;
  }

  private calculateVolumeConsistency(pool: Pool): number {
    // Simple heuristic: if 24h volume is > 1% of TVL, it's consistent
    if (pool.tvl === 0) return 0;
    const ratio = pool.volume24h / pool.tvl;
    
    if (ratio >= 0.1) return 100;  // 10%+ daily volume/TVL
    if (ratio >= 0.05) return 80;
    if (ratio >= 0.01) return 60;
    if (ratio >= 0.005) return 40;
    return 20;
  }

  private calculateVolumeTvlRatio(pool: Pool): number {
    if (pool.tvl === 0) return 0;
    const ratio = pool.volume24h / pool.tvl * 100;
    
    // Higher ratio = more efficient capital usage
    if (ratio >= 20) return 100;
    if (ratio >= 10) return 80;
    if (ratio >= 5) return 60;
    if (ratio >= 1) return 40;
    return 20;
  }

  private calculateFeeEfficiency(pool: Pool): number {
    // If we have fees data
    if (pool.fees24h && pool.tvl > 0) {
      const feeRatio = pool.fees24h / pool.tvl * 365 * 100; // Annualized
      if (feeRatio >= 50) return 100;
      if (feeRatio >= 30) return 80;
      if (feeRatio >= 15) return 60;
      if (feeRatio >= 5) return 40;
      return 20;
    }
    
    // Estimate from fee tier if available
    // feeTier is in decimal form: 0.003 = 0.3%
    if (pool.feeTier && pool.volume24h > 0) {
      const dailyFees = pool.volume24h * pool.feeTier;
      const annualizedApr = (dailyFees * 365) / pool.tvl * 100;
      return Math.min(100, annualizedApr);
    }
    
    // Last resort: use pool.apr to derive fee efficiency
    if (pool.apr && pool.apr > 0) {
      return Math.min(100, pool.apr);
    }

    return 20; // No data available — conservative low score
  }

  /**
   * Estimate pool age score from maturity signals.
   * Mature pools tend to have: high TVL, consistent volume, bluechip tokens.
   * Score: 0-100 (100 = very mature/established pool)
   */
  private estimateAgeScore(pool: Pool): number {
    let score = 30; // baseline for any pool that passed filters

    // High TVL signals established pool
    if (pool.tvl >= 10_000_000) score += 30;
    else if (pool.tvl >= 1_000_000) score += 20;
    else if (pool.tvl >= 100_000) score += 10;

    // Consistent volume relative to TVL signals active, mature pool
    if (pool.tvl > 0 && pool.volume24h > 0) {
      const ratio = pool.volume24h / pool.tvl;
      if (ratio >= 0.01) score += 20;
      else if (ratio >= 0.005) score += 10;
    }

    // Bluechip tokens signal mature pool
    if (pool.bluechip) score += 20;

    return Math.min(100, score);
  }

  private estimateApr(pool: Pool): number {
    // Estimate APR from volume and fee tier
    if (pool.tvl === 0) return 0;

    // Only estimate if we know the actual fee tier — don't assume 0.3%
    if (!pool.feeTier || pool.feeTier <= 0) return 0;

    const dailyFees = pool.volume24h * pool.feeTier;
    const annualizedApr = (dailyFees * 365) / pool.tvl * 100;

    return Math.round(annualizedApr * 10) / 10;
  }

  private calculateVolatilityPenalty(volatility?: number): number {
    if (volatility == null || volatility <= 0) {
      // Unknown volatility — apply moderate penalty (not too low, not too high)
      // This is more honest than assuming low risk (5) for unknown data
      return 10;
    }

    // Higher volatility = higher penalty
    if (volatility >= 30) return 25;
    if (volatility >= 20) return 20;
    if (volatility >= 10) return 12;
    if (volatility >= 5) return 5;
    return 0;
  }

  /**
   * Calculate liquidity drop penalty from recent TVL history.
   * Uses tvlPeak24h (from TheGraph poolHourData) vs current TVL.
   * A >20% drop from peak signals potential liquidity flight.
   */
  private calculateLiquidityDropPenalty(pool: Pool): number {
    if (!pool.tvlPeak24h || pool.tvlPeak24h <= 0 || pool.tvl <= 0) return 0;

    const dropPercent = ((pool.tvlPeak24h - pool.tvl) / pool.tvlPeak24h) * 100;

    if (dropPercent >= 50) return 20; // Severe liquidity flight
    if (dropPercent >= 30) return 15;
    if (dropPercent >= 20) return 10;
    if (dropPercent >= 10) return 5;
    return 0;
  }

  private determineMode(pool: Pool, metrics: PoolWithMetrics['metrics'] | undefined, score: number): Mode {
    // Use real volatility: metrics > pool.volatilityAnn (annualized, convert to %)
    // When no data available, default DEFENSIVE (safest assumption)
    const volatility = metrics?.volatility24h
      ?? (pool.volatilityAnn && pool.volatilityAnn > 0 ? pool.volatilityAnn * 100 : undefined);

    if (volatility == null) {
      // Unknown volatility — be conservative. Only allow NORMAL if score is very high.
      return score >= 75 ? 'NORMAL' : 'DEFENSIVE';
    }

    // High score + low volatility = can be aggressive
    if (score >= 70 && volatility <= MODE_THRESHOLDS.AGGRESSIVE.volatilityMax) {
      return 'AGGRESSIVE';
    }

    // Medium score or medium volatility = normal
    if (score >= 50 && volatility <= MODE_THRESHOLDS.NORMAL.volatilityMax) {
      return 'NORMAL';
    }

    // Default to defensive
    return 'DEFENSIVE';
  }

  private checkSuspect(
    pool: Pool,
    metrics: PoolWithMetrics['metrics'] | undefined,
    breakdown: ScoreBreakdown
  ): { isSuspect: boolean; suspectReason?: string } {
    const reasons: string[] = [];
    
    // Check for suspicious patterns
    if (pool.tvl < config.thresholds.minLiquidity) {
      reasons.push('TVL below minimum threshold');
    }
    
    if (pool.volume24h < config.thresholds.minVolume24h) {
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
