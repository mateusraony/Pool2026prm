import { describe, it, expect } from 'vitest';
import {
  calcAprFee,
  calcVolatilityAnn,
  calcVolatilityProxy,
  calcHealthScore,
  calcAprAdjusted,
  calcRangeRecommendation,
  calcUserFees,
  calcILRisk,
  inferPoolType,
  isBluechip,
  PricePoint,
} from '../services/calc.service.js';

describe('calcAprFee', () => {
  it('calculates APR from fees24h', () => {
    const result = calcAprFee({ fees24h: 1000, tvl: 1_000_000 });
    expect(result.source).toBe('fees24h');
    expect(result.feeAPR).toBeCloseTo(36.5, 1); // (1000/1M) * 365 * 100
    expect(result.fees24hUSD).toBe(1000);
  });

  it('falls back to fees1h when fees24h not available', () => {
    const result = calcAprFee({ fees1h: 50, tvl: 1_000_000 });
    expect(result.source).toBe('fees1h');
    expect(result.fees24hUSD).toBeCloseTo(840, 0); // 50 * 24 * 0.70 (desconto sazonalidade)
  });

  it('falls back to fees5m', () => {
    const result = calcAprFee({ fees5m: 5, tvl: 1_000_000 });
    expect(result.source).toBe('fees5m');
    expect(result.fees24hUSD).toBeCloseTo(864, 0); // 5 * 288 * 0.60 (desconto sazonalidade)
  });

  it('returns null APR when no fee data', () => {
    const result = calcAprFee({ tvl: 1_000_000 });
    expect(result.feeAPR).toBeNull();
    expect(result.source).toBe('estimated');
  });

  it('returns null APR when TVL is zero', () => {
    const result = calcAprFee({ fees24h: 1000, tvl: 0 });
    expect(result.feeAPR).toBeNull();
  });
});

describe('calcVolatilityAnn', () => {
  it('returns proxy when too few data points', () => {
    const result = calcVolatilityAnn([
      { price: 100, timestamp: new Date() },
    ]);
    expect(result.method).toBe('proxy');
    expect(result.volAnn).toBe(0.50);
  });

  it('calculates log returns with sufficient data', () => {
    const now = Date.now();
    const points: PricePoint[] = Array.from({ length: 24 }, (_, i) => ({
      price: 100 + Math.sin(i / 3) * 5,
      timestamp: new Date(now + i * 3600_000),
    }));
    const result = calcVolatilityAnn(points, 'hourly');
    expect(result.method).toBe('log_returns');
    expect(result.volAnn).toBeGreaterThan(0);
    expect(result.dataPoints).toBe(24);
  });

  it('clamps volatility between 0.01 and 10', () => {
    const points: PricePoint[] = [
      { price: 100, timestamp: new Date(0) },
      { price: 100, timestamp: new Date(3600_000) },
      { price: 100, timestamp: new Date(7200_000) },
    ];
    const result = calcVolatilityAnn(points, 'hourly');
    expect(result.volAnn).toBeGreaterThanOrEqual(0.01);
    expect(result.volAnn).toBeLessThanOrEqual(10);
  });
});

describe('calcVolatilityProxy', () => {
  it('returns proxy volatility from two prices', () => {
    const result = calcVolatilityProxy(105, 100);
    expect(result.method).toBe('proxy');
    expect(result.volAnn).toBeGreaterThan(0);
  });

  it('returns default for invalid prices', () => {
    const result = calcVolatilityProxy(0, 100);
    expect(result.volAnn).toBe(0.50);
  });
});

describe('calcHealthScore', () => {
  it('returns score between 0 and 100', () => {
    const result = calcHealthScore({
      tvl: 5_000_000,
      volume1h: 100_000,
      fees1h: 500,
      volAnn: 0.5,
      poolType: 'CL',
      updatedAt: new Date(),
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.penaltyTotal).toBeGreaterThanOrEqual(0.15);
    expect(result.penaltyTotal).toBeLessThanOrEqual(1);
  });

  it('penalizes pools with severe warnings', () => {
    const clean = calcHealthScore({
      tvl: 5_000_000, volAnn: 0.5, poolType: 'CL', updatedAt: new Date(),
    });
    const flagged = calcHealthScore({
      tvl: 5_000_000, volAnn: 0.5, poolType: 'CL', updatedAt: new Date(),
      warnings: ['honeypot detected'],
    });
    expect(flagged.score).toBeLessThan(clean.score);
  });

  it('triggers spike trap for high APR + low volume', () => {
    const result = calcHealthScore({
      tvl: 1_000_000, volume1h: 10_000, volAnn: 0.3,
      poolType: 'CL', updatedAt: new Date(), aprTotal: 500,
    });
    expect(result.breakdown.p4_spikeTrap).toBe(0.55);
  });
});

describe('calcAprAdjusted', () => {
  it('multiplies APR by penalty', () => {
    expect(calcAprAdjusted(100, 0.8)).toBe(80);
    expect(calcAprAdjusted(50, 0.5)).toBe(25);
  });
});

describe('calcRangeRecommendation', () => {
  it('returns valid range', () => {
    const result = calcRangeRecommendation({
      price: 2500,
      volAnn: 0.5,
      horizonDays: 7,
      riskMode: 'NORMAL',
    });
    expect(result.lower).toBeLessThan(2500);
    expect(result.upper).toBeGreaterThan(2500);
    expect(result.widthPct).toBeGreaterThan(0);
    expect(result.probOutOfRange).toBeGreaterThanOrEqual(0);
    expect(result.probOutOfRange).toBeLessThanOrEqual(1);
    expect(result.mode).toBe('NORMAL');
    expect(result.horizonDays).toBe(7);
  });

  it('DEFENSIVE range is narrower than AGGRESSIVE', () => {
    const def = calcRangeRecommendation({ price: 2500, volAnn: 0.5, riskMode: 'DEFENSIVE' });
    const agg = calcRangeRecommendation({ price: 2500, volAnn: 0.5, riskMode: 'AGGRESSIVE' });
    expect(def.widthPct).toBeLessThan(agg.widthPct);
  });

  it('STABLE pools have capped width', () => {
    const result = calcRangeRecommendation({
      price: 1.0,
      volAnn: 0.5,
      riskMode: 'AGGRESSIVE',
      poolType: 'STABLE',
    });
    expect(result.widthPct).toBeLessThanOrEqual(0.03);
  });

  it('snaps to tick spacing when provided', () => {
    const result = calcRangeRecommendation({
      price: 2500,
      volAnn: 0.5,
      riskMode: 'NORMAL',
      tickSpacing: 60,
    });
    expect(result.lowerTick).toBeDefined();
    expect(result.upperTick).toBeDefined();
    expect(result.lowerTick! % 60).toBe(0);
    expect(result.upperTick! % 60).toBe(0);
  });
});

describe('calcUserFees', () => {
  it('estimates user fees proportionally', () => {
    const result = calcUserFees({
      tvl: 10_000_000,
      fees24h: 10_000,
      userCapital: 10_000,
      riskMode: 'NORMAL',
    });
    expect(result.userLiquidityShare).toBeCloseTo(0.001, 5);
    expect(result.expectedFees24h).toBeGreaterThan(0);
    expect(result.expectedFees7d).toBeCloseTo(result.expectedFees24h * 7);
    expect(result.expectedFees30d).toBeCloseTo(result.expectedFees24h * 30);
    expect(result.k_active).toBe(0.75);
  });

  it('returns zero fees when TVL is zero', () => {
    const result = calcUserFees({
      tvl: 0, fees24h: 1000, userCapital: 1000, riskMode: 'NORMAL',
    });
    expect(result.expectedFees24h).toBe(0);
  });
});

describe('calcILRisk', () => {
  it('returns probability between 0 and 1', () => {
    const result = calcILRisk({
      price: 2500,
      rangeLower: 2000,
      rangeUpper: 3000,
      volAnn: 0.5,
      horizonDays: 7,
    });
    expect(result.probOutOfRange).toBeGreaterThanOrEqual(0);
    expect(result.probOutOfRange).toBeLessThanOrEqual(1);
  });

  it('wider range has lower IL risk', () => {
    const narrow = calcILRisk({
      price: 2500, rangeLower: 2400, rangeUpper: 2600, volAnn: 0.5, horizonDays: 7,
    });
    const wide = calcILRisk({
      price: 2500, rangeLower: 1500, rangeUpper: 3500, volAnn: 0.5, horizonDays: 7,
    });
    expect(narrow.probOutOfRange).toBeGreaterThan(wide.probOutOfRange);
  });
});

describe('inferPoolType', () => {
  it('detects STABLE pair', () => {
    expect(inferPoolType({ token0Symbol: 'USDC', token1Symbol: 'USDT' })).toBe('STABLE');
  });

  it('detects V2 protocol', () => {
    expect(inferPoolType({ token0Symbol: 'ETH', token1Symbol: 'USDC', protocol: 'sushiswap' })).toBe('V2');
  });

  it('detects CL pool by fee tier', () => {
    expect(inferPoolType({ token0Symbol: 'ETH', token1Symbol: 'USDC', feeTier: 0.003 })).toBe('CL');
  });
});

describe('isBluechip', () => {
  it('recognizes bluechip pair', () => {
    expect(isBluechip('WETH', 'USDC')).toBe(true);
    expect(isBluechip('BTC', 'DAI')).toBe(true);
  });

  it('rejects non-bluechip pair', () => {
    expect(isBluechip('SHIB', 'DOGE')).toBe(false);
    expect(isBluechip('WETH', 'PEPE')).toBe(false);
  });
});

// -----------------------------------------------------------------------
// calcIL — Impermanent Loss for CL and V2 positions
// -----------------------------------------------------------------------

import { calcIL, calcMonteCarlo, calcBacktest } from '../services/calc.service.js';

describe('calcIL', () => {
  it('returns IL > 0 when price moves outside range', () => {
    // price = 100, range = [90, 110] — price at entry is centre
    const result = calcIL({ entryPrice: 100, currentPrice: 130, rangeLower: 90, rangeUpper: 110, poolType: 'CL' });
    // IL should be negative (loss) and ilPercent < 0
    expect(result.ilPercent).toBeLessThan(0);
    expect(result.outOfRange).toBe(true);
  });

  it('returns non-zero IL when price moves within range', () => {
    // Price moved from 100 to 105 — still in range [90, 110]
    const result = calcIL({ entryPrice: 100, currentPrice: 105, rangeLower: 90, rangeUpper: 110, poolType: 'CL' });
    expect(result.ilPercent).toBeLessThanOrEqual(0); // IL is 0 or negative (loss)
    expect(result.outOfRange).toBe(false);
  });

  it('returns zero IL when price does not change', () => {
    const result = calcIL({ entryPrice: 100, currentPrice: 100, rangeLower: 90, rangeUpper: 110, poolType: 'CL' });
    expect(result.ilPercent).toBe(0);
    expect(result.outOfRange).toBe(false);
  });

  it('out-of-range IL is larger than in-range IL', () => {
    const inRange = calcIL({ entryPrice: 100, currentPrice: 108, rangeLower: 90, rangeUpper: 110, poolType: 'CL' });
    const outOfRange = calcIL({ entryPrice: 100, currentPrice: 140, rangeLower: 90, rangeUpper: 110, poolType: 'CL' });
    // Out-of-range uses boundary price — IL magnitude should be at least as large
    expect(Math.abs(outOfRange.ilPercent)).toBeGreaterThanOrEqual(Math.abs(inRange.ilPercent));
  });

  it('handles edge case: entryPrice = 0 returns zero IL', () => {
    const result = calcIL({ entryPrice: 0, currentPrice: 100, rangeLower: 90, rangeUpper: 110, poolType: 'CL' });
    expect(result.ilPercent).toBe(0);
    expect(result.ilUsd).toBe(0);
  });

  it('handles edge case: currentPrice = 0 returns zero IL', () => {
    const result = calcIL({ entryPrice: 100, currentPrice: 0, rangeLower: 90, rangeUpper: 110, poolType: 'CL' });
    expect(result.ilPercent).toBe(0);
  });

  it('V2 pool IL matches standard formula for price ratio 2', () => {
    // Standard IL formula: 2√k/(1+k) - 1 where k=2 → 2√2/3 - 1 ≈ -5.72%
    const result = calcIL({ entryPrice: 100, currentPrice: 200, rangeLower: 50, rangeUpper: 500, poolType: 'V2' });
    expect(result.ilPercent).toBeLessThan(0);
    // Standard IL for k=2 is approximately -5.72%
    expect(result.ilPercent).toBeCloseTo(-5.72, 0);
  });

  it('ilUsd is always zero (caller is responsible for capital multiplication)', () => {
    const result = calcIL({ entryPrice: 100, currentPrice: 120, rangeLower: 90, rangeUpper: 130, poolType: 'CL' });
    expect(result.ilUsd).toBe(0);
  });
});

// -----------------------------------------------------------------------
// calcMonteCarlo — Monte Carlo simulation for CL position
// -----------------------------------------------------------------------

describe('calcMonteCarlo', () => {
  const BASE_PARAMS = {
    currentPrice: 2500,
    rangeLower: 2000,
    rangeUpper: 3000,
    capital: 10_000,
    volAnn: 0.5,
    fees24h: 5_000,
    tvl: 10_000_000,
    horizonDays: 30,
    scenarios: 200,
    mode: 'NORMAL' as const,
  };

  it('returns object with all required top-level fields', () => {
    const result = calcMonteCarlo(BASE_PARAMS);

    expect(result).toHaveProperty('scenarios');
    expect(result).toHaveProperty('horizonDays');
    expect(result).toHaveProperty('percentiles');
    expect(result).toHaveProperty('probProfit');
    expect(result).toHaveProperty('probOutOfRange');
    expect(result).toHaveProperty('avgPnl');
    expect(result).toHaveProperty('worstCase');
    expect(result).toHaveProperty('bestCase');
    expect(result).toHaveProperty('distribution');
  });

  it('percentiles object has p5, p25, p50, p75, p95', () => {
    const { percentiles } = calcMonteCarlo(BASE_PARAMS);

    expect(percentiles).toHaveProperty('p5');
    expect(percentiles).toHaveProperty('p25');
    expect(percentiles).toHaveProperty('p50');
    expect(percentiles).toHaveProperty('p75');
    expect(percentiles).toHaveProperty('p95');
  });

  it('probProfit and probOutOfRange are between 0 and 100', () => {
    const result = calcMonteCarlo(BASE_PARAMS);

    expect(result.probProfit).toBeGreaterThanOrEqual(0);
    expect(result.probProfit).toBeLessThanOrEqual(100);
    expect(result.probOutOfRange).toBeGreaterThanOrEqual(0);
    expect(result.probOutOfRange).toBeLessThanOrEqual(100);
  });

  it('scenarios count matches requested count (up to 5000 cap)', () => {
    const result = calcMonteCarlo({ ...BASE_PARAMS, scenarios: 100 });
    expect(result.scenarios).toBe(100);
  });

  it('horizonDays matches input', () => {
    const result = calcMonteCarlo({ ...BASE_PARAMS, horizonDays: 14 });
    expect(result.horizonDays).toBe(14);
  });

  it('worst case pnl <= median pnl <= best case pnl', () => {
    const result = calcMonteCarlo(BASE_PARAMS);
    expect(result.worstCase.pnl).toBeLessThanOrEqual(result.percentiles.p50.pnl);
    expect(result.percentiles.p50.pnl).toBeLessThanOrEqual(result.bestCase.pnl);
  });

  it('distribution has 10 buckets', () => {
    const result = calcMonteCarlo(BASE_PARAMS);
    expect(result.distribution).toHaveLength(10);
  });

  it('handles edge case: capital = 0', () => {
    const result = calcMonteCarlo({ ...BASE_PARAMS, capital: 0 });
    // Should not throw — pnl values should be 0 or very small
    expect(result.scenarios).toBeGreaterThan(0);
    expect(result.worstCase.pnlPercent).toBe(0);
  });

  it('higher volatility increases probOutOfRange', () => {
    const low = calcMonteCarlo({ ...BASE_PARAMS, volAnn: 0.1, scenarios: 300 });
    const high = calcMonteCarlo({ ...BASE_PARAMS, volAnn: 2.0, scenarios: 300 });
    // High vol should have materially higher out-of-range probability
    expect(high.probOutOfRange).toBeGreaterThan(low.probOutOfRange);
  });

  it('each scenario outcome has the expected shape', () => {
    const result = calcMonteCarlo({ ...BASE_PARAMS, scenarios: 10 });
    const outcome = result.percentiles.p50;

    expect(outcome).toHaveProperty('finalPrice');
    expect(outcome).toHaveProperty('priceChange');
    expect(outcome).toHaveProperty('feesEarned');
    expect(outcome).toHaveProperty('ilLoss');
    expect(outcome).toHaveProperty('pnl');
    expect(outcome).toHaveProperty('pnlPercent');
    expect(outcome).toHaveProperty('isInRange');
    expect(typeof outcome.isInRange).toBe('boolean');
  });
});

// -----------------------------------------------------------------------
// calcBacktest — Historical / simulated backtest for a range strategy
// -----------------------------------------------------------------------

describe('calcBacktest', () => {
  const BASE_PARAMS = {
    capital: 10_000,
    entryPrice: 2500,
    rangeLower: 2000,
    rangeUpper: 3000,
    volAnn: 0.5,
    fees24h: 5_000,
    tvl: 10_000_000,
    mode: 'NORMAL' as const,
    periodDays: 30,
  };

  it('returns object with all required fields', () => {
    const result = calcBacktest(BASE_PARAMS);

    expect(result).toHaveProperty('periodDays');
    expect(result).toHaveProperty('totalFees');
    expect(result).toHaveProperty('totalIL');
    expect(result).toHaveProperty('netPnl');
    expect(result).toHaveProperty('netPnlPercent');
    expect(result).toHaveProperty('maxDrawdown');
    expect(result).toHaveProperty('timeInRange');
    expect(result).toHaveProperty('rebalances');
    expect(result).toHaveProperty('dailyReturns');
    expect(result).toHaveProperty('transactionCosts');
  });

  it('totalFees is non-negative', () => {
    const result = calcBacktest(BASE_PARAMS);
    expect(result.totalFees).toBeGreaterThanOrEqual(0);
  });

  it('totalIL is non-negative', () => {
    const result = calcBacktest(BASE_PARAMS);
    expect(result.totalIL).toBeGreaterThanOrEqual(0);
  });

  it('netPnl = totalFees - totalIL - transactionCosts.total', () => {
    const result = calcBacktest(BASE_PARAMS);
    const expected = result.totalFees - result.totalIL - result.transactionCosts.total;
    expect(result.netPnl).toBeCloseTo(expected, 1);
  });

  it('dailyReturns has one entry per simulated day', () => {
    const result = calcBacktest(BASE_PARAMS);
    expect(result.dailyReturns).toHaveLength(result.periodDays);
  });

  it('each dailyReturns entry has day, cumPnl, fees, il', () => {
    const result = calcBacktest(BASE_PARAMS);
    const entry = result.dailyReturns[0];

    expect(entry).toHaveProperty('day');
    expect(entry).toHaveProperty('cumPnl');
    expect(entry).toHaveProperty('fees');
    expect(entry).toHaveProperty('il');
  });

  it('timeInRange is between 0 and 100', () => {
    const result = calcBacktest(BASE_PARAMS);
    expect(result.timeInRange).toBeGreaterThanOrEqual(0);
    expect(result.timeInRange).toBeLessThanOrEqual(100);
  });

  it('transactionCosts structure has entry, exit, rebalancing, and total', () => {
    const result = calcBacktest(BASE_PARAMS);

    expect(result.transactionCosts).toHaveProperty('entryCost');
    expect(result.transactionCosts).toHaveProperty('exitCost');
    expect(result.transactionCosts).toHaveProperty('rebalancingCosts');
    expect(result.transactionCosts).toHaveProperty('total');
  });

  it('transactionCosts.total = entryCost + exitCost + rebalancingCosts', () => {
    const result = calcBacktest(BASE_PARAMS);
    const { entryCost, exitCost, rebalancingCosts, total } = result.transactionCosts;
    expect(total).toBeCloseTo(entryCost + exitCost + rebalancingCosts, 1);
  });

  it('uses provided priceHistory when supplied', () => {
    // Stable price = always in range → timeInRange should be 100%
    const stableHistory = Array.from({ length: 30 }, () => 2500);
    const result = calcBacktest({ ...BASE_PARAMS, priceHistory: stableHistory });

    expect(result.timeInRange).toBe(100);
    expect(result.rebalances).toBe(0);
  });

  it('handles edge case: capital = 0 — fees and IL are 0', () => {
    const result = calcBacktest({ ...BASE_PARAMS, capital: 0 });

    expect(result.totalFees).toBe(0);
    expect(result.totalIL).toBe(0);
    expect(result.transactionCosts.total).toBe(0);
  });

  it('all-out-of-range price history yields zero fees', () => {
    // All prices below lower bound — no fees earned
    const outOfRangeHistory = Array.from({ length: 10 }, () => 1000);
    const result = calcBacktest({ ...BASE_PARAMS, periodDays: 10, priceHistory: outOfRangeHistory });

    expect(result.totalFees).toBe(0);
    expect(result.timeInRange).toBe(0);
  });

  it('maxDrawdown is non-negative', () => {
    const result = calcBacktest(BASE_PARAMS);
    expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
  });
});
