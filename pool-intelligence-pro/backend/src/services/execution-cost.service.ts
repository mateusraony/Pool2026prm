/**
 * Execution Cost Service
 * Replaces the concept of "spreadPenalty" (which applies to order-book exchanges)
 * with "executionCostPenalty" appropriate for AMM pools.
 *
 * For AMMs (Uniswap v3, Curve, etc.), the equivalent of "spread" is price impact:
 * - Determined by trade size relative to pool liquidity depth
 * - For concentrated liquidity (CL) pools: depends on TVL within active range
 * - For V2 pools: constant product formula → priceImpact ≈ tradeSize / (2 * reserve)
 *
 * This module estimates execution cost for standard trade sizes ($100 and $1000)
 * and maps it to a penalty score (0-10 points).
 *
 * No external quote API needed — estimated from pool metrics already available.
 */

import { logService } from './log.service.js';

export interface ExecutionCostResult {
  /** Estimated price impact for $100 trade (%) */
  impact100: number;
  /** Estimated price impact for $1000 trade (%) */
  impact1000: number;
  /** Penalty score (0-10) */
  executionCostPenalty: number;
  /** Pool type used for calculation */
  poolType: string;
  /** Explanation */
  reason: string;
}

/**
 * Estimate price impact for an AMM pool.
 *
 * Model:
 * - V2 (constant product): impact ≈ tradeSize / (2 × reserveUSD)
 * - CL (concentrated): impact ≈ tradeSize / (activeLiquidity)
 *   where activeLiquidity ≈ TVL × concentration_factor
 *   concentration_factor estimated from volume/TVL ratio:
 *   higher vol/TVL = more active liquidity concentrated near price
 * - STABLE: very deep liquidity, minimal impact
 *
 * @param tradeSize   Trade size in USD
 * @param tvl         Pool TVL in USD
 * @param volume24h   Pool 24h volume in USD
 * @param poolType    'CL' | 'V2' | 'STABLE'
 * @param feeTier     Fee tier in decimal (0.003 = 0.3%)
 */
function estimatePriceImpact(
  tradeSize: number,
  tvl: number,
  volume24h: number,
  poolType: string,
  feeTier?: number
): number {
  if (tvl <= 0) return 100; // no liquidity = 100% impact
  if (tradeSize <= 0) return 0;

  switch (poolType) {
    case 'STABLE': {
      // Stableswap pools have very deep liquidity within narrow range
      // Impact is minimal — typically < 0.01% for normal trades
      // Model: impact ≈ tradeSize / (10 × tvl)
      return (tradeSize / (10 * tvl)) * 100;
    }

    case 'CL': {
      // Concentrated liquidity — effective depth depends on how much
      // liquidity is concentrated near current price.
      // Proxy: higher volume/TVL ratio = more concentrated liquidity.
      const volTvlRatio = volume24h > 0 ? volume24h / tvl : 0.01;
      // concentration_factor: ranges from 1 (spread out) to 10 (very concentrated)
      const concentrationFactor = Math.min(10, Math.max(1, volTvlRatio * 20));
      const effectiveLiquidity = tvl * concentrationFactor;
      return (tradeSize / effectiveLiquidity) * 100;
    }

    case 'V2':
    default: {
      // Constant product: impact ≈ tradeSize / (2 × reserveUSD)
      return (tradeSize / (2 * tvl)) * 100;
    }
  }
}

/**
 * Map price impact to penalty score.
 * Impact < 0.1%: 0 (excellent execution)
 * 0.1-0.5%:     2 (good)
 * 0.5-1%:       4 (moderate)
 * 1-3%:         6 (poor for LP)
 * 3-5%:         8 (bad — thin pool)
 * > 5%:        10 (dangerous — avoid)
 */
function impactToPenalty(impact: number): number {
  if (impact < 0.1) return 0;
  if (impact < 0.5) return 2;
  if (impact < 1) return 4;
  if (impact < 3) return 6;
  if (impact < 5) return 8;
  return 10;
}

/**
 * Calculate execution cost penalty for a pool.
 */
export function calculateExecutionCost(
  tvl: number,
  volume24h: number,
  poolType: string = 'CL',
  feeTier?: number
): ExecutionCostResult {
  const impact100 = estimatePriceImpact(100, tvl, volume24h, poolType, feeTier);
  const impact1000 = estimatePriceImpact(1000, tvl, volume24h, poolType, feeTier);

  // Use the $1000 impact for penalty (more representative of real trades)
  const executionCostPenalty = impactToPenalty(impact1000);

  let reason: string;
  if (executionCostPenalty === 0) {
    reason = `Deep liquidity — $1K impact ${impact1000.toFixed(3)}%`;
  } else if (executionCostPenalty <= 4) {
    reason = `Moderate depth — $1K impact ${impact1000.toFixed(2)}%`;
  } else {
    reason = `Thin liquidity — $1K impact ${impact1000.toFixed(2)}%, $100 impact ${impact100.toFixed(3)}%`;
  }

  return {
    impact100: Math.round(impact100 * 10000) / 10000,
    impact1000: Math.round(impact1000 * 10000) / 10000,
    executionCostPenalty,
    poolType,
    reason,
  };
}

export const executionCostService = {
  calculateExecutionCost,
};
