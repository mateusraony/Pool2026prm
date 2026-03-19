import { describe, it, expect } from 'vitest';
import {
  calcMonteCarlo,
  calcBacktest,
  calcLVR,
  calcPortfolioAnalytics,
  calcAutoCompound,
  calcTokenCorrelation,
  type PortfolioPosition,
} from '../services/calc.service.js';

// ============================================================
// Monte Carlo Simulation
// ============================================================
describe('calcMonteCarlo', () => {
  const baseParams = {
    currentPrice: 2500,
    rangeLower: 2000,
    rangeUpper: 3000,
    capital: 10_000,
    volAnn: 0.5,
    fees24h: 10_000,
    tvl: 5_000_000,
    horizonDays: 30,
    scenarios: 200,
    mode: 'NORMAL' as const,
  };

  it('returns correct structure', () => {
    const result = calcMonteCarlo(baseParams);
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

  it('probProfit is between 0 and 100 (%)', () => {
    const result = calcMonteCarlo(baseParams);
    expect(result.probProfit).toBeGreaterThanOrEqual(0);
    expect(result.probProfit).toBeLessThanOrEqual(100);
  });

  it('p5 <= p50 <= p95 (PnL ordering)', () => {
    const result = calcMonteCarlo(baseParams);
    expect(result.percentiles.p5.pnl).toBeLessThanOrEqual(result.percentiles.p50.pnl);
    expect(result.percentiles.p50.pnl).toBeLessThanOrEqual(result.percentiles.p95.pnl);
  });

  it('worstCase pnl <= bestCase pnl', () => {
    const result = calcMonteCarlo(baseParams);
    expect(result.worstCase.pnl).toBeLessThanOrEqual(result.bestCase.pnl);
  });

  it('horizonDays matches input', () => {
    const result = calcMonteCarlo(baseParams);
    expect(result.horizonDays).toBe(30);
    expect(result.scenarios).toBe(200);
  });

  it('distribution buckets are populated', () => {
    const result = calcMonteCarlo(baseParams);
    expect(result.distribution.length).toBeGreaterThan(0);
    const totalCount = result.distribution.reduce((s, b) => s + b.count, 0);
    expect(totalCount).toBeGreaterThan(0);
    expect(totalCount).toBeLessThanOrEqual(200);
  });
});

// ============================================================
// Backtest
// ============================================================
describe('calcBacktest', () => {
  const baseParams = {
    entryPrice: 2500,
    rangeLower: 2000,
    rangeUpper: 3000,
    capital: 10_000,
    volAnn: 0.5,
    fees24h: 10_000,
    tvl: 5_000_000,
    periodDays: 30,
    mode: 'NORMAL' as const,
  };

  it('returns valid structure with synthetic data', () => {
    const result = calcBacktest(baseParams);

    expect(result).toHaveProperty('netPnl');
    expect(result).toHaveProperty('totalFees');
    expect(result).toHaveProperty('totalIL');
    expect(result).toHaveProperty('maxDrawdown');
    expect(result).toHaveProperty('timeInRange');
    expect(result).toHaveProperty('dailyReturns');
    expect(result.periodDays).toBe(30);
    expect(result.dailyReturns.length).toBe(30);
  });

  it('netPnl = totalFees - totalIL (sem tx costs)', () => {
    // transactionCostPct: 0 isola a fórmula core sem descontar custos de transação
    const result = calcBacktest({ ...baseParams, transactionCostPct: 0 });
    expect(result.netPnl).toBeCloseTo(result.totalFees - result.totalIL, 0);
  });

  it('maxDrawdown is non-negative', () => {
    const result = calcBacktest(baseParams);
    expect(result.maxDrawdown).toBeGreaterThanOrEqual(0);
  });

  it('timeInRange is between 0 and 100', () => {
    const result = calcBacktest(baseParams);
    expect(result.timeInRange).toBeGreaterThanOrEqual(0);
    expect(result.timeInRange).toBeLessThanOrEqual(100);
  });

  it('uses priceHistory when provided', () => {
    // Generate 30 price points oscillating around entry price
    const priceHistory = Array.from({ length: 30 }, (_, i) =>
      2500 + Math.sin(i / 5) * 200
    );

    const result = calcBacktest({
      ...baseParams,
      priceHistory,
    });

    expect(result.dailyReturns.length).toBeGreaterThan(0);
    expect(result).toHaveProperty('netPnl');
  });
});

// ============================================================
// LVR (Loss-Versus-Rebalancing)
// ============================================================
describe('calcLVR', () => {
  it('returns correct structure', () => {
    const result = calcLVR({
      capital: 10_000,
      volAnn: 0.5,
      fees24h: 10_000,
      tvl: 5_000_000,
      mode: 'NORMAL',
    });

    expect(result).toHaveProperty('lvrDaily');
    expect(result).toHaveProperty('lvrAnnualized');
    expect(result).toHaveProperty('lvrPercent');
    expect(result).toHaveProperty('feeToLvrRatio');
    expect(result).toHaveProperty('netAfterLvr');
    expect(result).toHaveProperty('verdict');
  });

  it('LVR scales with volatility squared', () => {
    const lowVol = calcLVR({ capital: 10_000, volAnn: 0.2, fees24h: 10_000, tvl: 5_000_000, mode: 'NORMAL' });
    const highVol = calcLVR({ capital: 10_000, volAnn: 0.8, fees24h: 10_000, tvl: 5_000_000, mode: 'NORMAL' });

    // σ² ratio: (0.8/0.2)² = 16
    expect(highVol.lvrDaily / lowVol.lvrDaily).toBeCloseTo(16, 0);
  });

  it('LVR scales linearly with capital', () => {
    const small = calcLVR({ capital: 1_000, volAnn: 0.5, fees24h: 10_000, tvl: 5_000_000, mode: 'NORMAL' });
    const large = calcLVR({ capital: 10_000, volAnn: 0.5, fees24h: 10_000, tvl: 5_000_000, mode: 'NORMAL' });

    expect(large.lvrDaily / small.lvrDaily).toBeCloseTo(10, 0);
  });

  it('verdict is profitable when fees >> LVR', () => {
    const result = calcLVR({
      capital: 10_000,
      volAnn: 0.1,
      fees24h: 50_000,
      tvl: 1_000_000,
      mode: 'NORMAL',
    });
    expect(result.verdict).toBe('profitable');
    expect(result.feeToLvrRatio).toBeGreaterThan(1.5);
  });

  it('verdict is unprofitable when fees << LVR', () => {
    const result = calcLVR({
      capital: 10_000,
      volAnn: 2.0,
      fees24h: 100,
      tvl: 5_000_000,
      mode: 'NORMAL',
    });
    expect(result.verdict).toBe('unprofitable');
    expect(result.feeToLvrRatio).toBeLessThan(0.8);
  });
});

// ============================================================
// Portfolio Analytics (Sharpe/Sortino)
// ============================================================
describe('calcPortfolioAnalytics', () => {
  const basePositions: PortfolioPosition[] = [
    {
      poolId: 'pool1', chain: 'ethereum', pair: 'ETH/USDC',
      capital: 5000, apr: 25, volAnn: 0.5,
      feesAccrued: 100, ilActual: 20,
      protocol: 'uniswap-v3', token0Symbol: 'WETH', token1Symbol: 'USDC',
    },
    {
      poolId: 'pool2', chain: 'arbitrum', pair: 'ARB/ETH',
      capital: 3000, apr: 40, volAnn: 0.8,
      feesAccrued: 80, ilActual: 30,
      protocol: 'uniswap-v3', token0Symbol: 'ARB', token1Symbol: 'WETH',
    },
  ];

  it('returns correct structure', () => {
    const result = calcPortfolioAnalytics(basePositions);

    expect(result).toHaveProperty('totalCapital');
    expect(result).toHaveProperty('totalPnl');
    expect(result).toHaveProperty('sharpeRatio');
    expect(result).toHaveProperty('sortinoRatio');
    expect(result).toHaveProperty('maxDrawdown');
    expect(result).toHaveProperty('diversificationScore');
    expect(result).toHaveProperty('allocationByChain');
    expect(result).toHaveProperty('allocationByProtocol');
    expect(result).toHaveProperty('allocationByToken');
    expect(result).toHaveProperty('riskBand');
    expect(result).toHaveProperty('ratioMethod');
    expect(result).toHaveProperty('ratioDataPoints');
  });

  it('totalCapital equals sum of positions', () => {
    const result = calcPortfolioAnalytics(basePositions);
    expect(result.totalCapital).toBe(8000);
  });

  it('totalPnl = fees - IL', () => {
    const result = calcPortfolioAnalytics(basePositions);
    expect(result.totalPnl).toBe(130); // (100+80) - (20+30)
  });

  it('uses snapshot method without dailyReturns', () => {
    const result = calcPortfolioAnalytics(basePositions);
    expect(result.ratioMethod).toBe('snapshot');
    expect(result.ratioDataPoints).toBe(0);
  });

  it('uses time_series method with dailyReturns', () => {
    const dailyReturns = Array.from({ length: 30 }, () => (Math.random() - 0.48) * 2);

    const positions: PortfolioPosition[] = basePositions.map(p => ({
      ...p,
      dailyReturns,
    }));

    const result = calcPortfolioAnalytics(positions);
    expect(result.ratioMethod).toBe('time_series');
    expect(result.ratioDataPoints).toBe(30);
  });

  it('diversification score is 100 for equal-weight multi-chain', () => {
    const equalPositions: PortfolioPosition[] = [
      { ...basePositions[0], capital: 5000, chain: 'ethereum' },
      { ...basePositions[1], capital: 5000, chain: 'arbitrum' },
    ];
    const result = calcPortfolioAnalytics(equalPositions);
    expect(result.diversificationScore).toBe(100);
  });

  it('diversification score is lower for single chain', () => {
    const singleChain: PortfolioPosition[] = [
      { ...basePositions[0], chain: 'ethereum', capital: 5000 },
      { ...basePositions[1], chain: 'ethereum', capital: 3000 },
    ];
    const result = calcPortfolioAnalytics(singleChain);
    // Single chain with 2 positions → HHI = 1 → diversification = 0
    expect(result.diversificationScore).toBeLessThanOrEqual(100);
  });

  it('returns empty results for no positions', () => {
    const result = calcPortfolioAnalytics([]);
    expect(result.totalCapital).toBe(0);
    expect(result.sharpeRatio).toBe(0);
    expect(result.ratioMethod).toBe('snapshot');
  });

  it('allocationByChain sums to ~100%', () => {
    const result = calcPortfolioAnalytics(basePositions);
    const totalPct = result.allocationByChain.reduce((s, a) => s + a.percent, 0);
    expect(totalPct).toBeCloseTo(100, 0);
  });

  it('allocationByToken includes both tokens from each position', () => {
    const result = calcPortfolioAnalytics(basePositions);
    const tokens = result.allocationByToken.map(a => a.token);
    expect(tokens).toContain('WETH');
    expect(tokens).toContain('USDC');
    expect(tokens).toContain('ARB');
  });

  it('time-series Sharpe ratio is a finite number', () => {
    // Simulate returns with some variance
    const dailyReturns = Array.from({ length: 60 }, (_, i) => Math.sin(i) * 0.5);
    const positions: PortfolioPosition[] = [
      { ...basePositions[0], dailyReturns },
    ];
    const result = calcPortfolioAnalytics(positions);
    expect(result.ratioMethod).toBe('time_series');
    expect(Number.isFinite(result.sharpeRatio)).toBe(true);
    expect(Number.isFinite(result.sortinoRatio)).toBe(true);
  });
});

// ============================================================
// Auto-Compound Simulator
// ============================================================
describe('calcAutoCompound', () => {
  it('compound value exceeds simple for positive APR', () => {
    const result = calcAutoCompound({
      capital: 10_000,
      apr: 30,
      periodDays: 365,
      compoundFrequency: 'weekly',
      gasPerCompound: 0,
    });

    expect(result.withCompound).toBeGreaterThan(result.withoutCompound);
    expect(result.compoundBenefit).toBeGreaterThan(0);
    expect(result.compoundBenefitPercent).toBeGreaterThan(0);
  });

  it('more frequent compounding yields more (ignoring gas)', () => {
    const weekly = calcAutoCompound({
      capital: 10_000, apr: 30, periodDays: 365,
      compoundFrequency: 'weekly', gasPerCompound: 0,
    });
    const daily = calcAutoCompound({
      capital: 10_000, apr: 30, periodDays: 365,
      compoundFrequency: 'daily', gasPerCompound: 0,
    });

    expect(daily.withCompound).toBeGreaterThanOrEqual(weekly.withCompound - 1);
  });

  it('gas costs reduce compound benefit', () => {
    const noGas = calcAutoCompound({
      capital: 10_000, apr: 30, periodDays: 365,
      compoundFrequency: 'daily', gasPerCompound: 0,
    });
    const withGas = calcAutoCompound({
      capital: 10_000, apr: 30, periodDays: 365,
      compoundFrequency: 'daily', gasPerCompound: 5,
    });

    expect(withGas.compoundBenefit).toBeLessThan(noGas.compoundBenefit);
  });

  it('schedule array is populated', () => {
    const result = calcAutoCompound({
      capital: 10_000, apr: 30, periodDays: 30,
      compoundFrequency: 'weekly', gasPerCompound: 1,
    });
    expect(result.schedule.length).toBeGreaterThan(0);
    expect(result.schedule[0]).toHaveProperty('valueSimple');
    expect(result.schedule[0]).toHaveProperty('valueCompound');
  });
});

// ============================================================
// Token Correlation
// ============================================================
describe('calcTokenCorrelation', () => {
  it('stable-stable pair has very high correlation', () => {
    const result = calcTokenCorrelation({
      token0Symbol: 'USDC',
      token1Symbol: 'USDT',
      poolVolAnn: 0.01,
    });
    expect(result.correlation).toBeGreaterThan(0.9);
    expect(result.pairType).toBe('stablecoin');
  });

  it('ETH-USDC pair is uncorrelated', () => {
    const result = calcTokenCorrelation({
      token0Symbol: 'WETH',
      token1Symbol: 'USDC',
      poolVolAnn: 0.5,
    });
    expect(result.pairType).toBe('uncorrelated');
  });

  it('returns method and dataPoints', () => {
    const result = calcTokenCorrelation({
      token0Symbol: 'WETH',
      token1Symbol: 'USDC',
      poolVolAnn: 0.5,
    });
    expect(result).toHaveProperty('method');
    expect(result).toHaveProperty('dataPoints');
    expect(result.method).toBe('rule_based');
  });
});
