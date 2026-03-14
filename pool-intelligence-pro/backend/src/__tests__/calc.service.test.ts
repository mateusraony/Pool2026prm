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
    expect(result.fees24hUSD).toBe(1200); // 50 * 24
  });

  it('falls back to fees5m', () => {
    const result = calcAprFee({ fees5m: 5, tvl: 1_000_000 });
    expect(result.source).toBe('fees5m');
    expect(result.fees24hUSD).toBe(1440); // 5 * 288
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
    expect(result.volAnn).toBe(0.15);
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
    expect(result.volAnn).toBe(0.15);
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
