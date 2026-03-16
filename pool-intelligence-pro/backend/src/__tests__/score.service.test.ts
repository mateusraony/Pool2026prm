import { describe, it, expect } from 'vitest';
import { ScoreService } from '../services/score.service.js';
import { Pool } from '../types/index.js';

function makePool(overrides: Partial<Pool> = {}): Pool {
  return {
    externalId: 'test-pool-1',
    chain: 'ethereum',
    protocol: 'uniswap-v3',
    poolAddress: '0x1234',
    token0: { symbol: 'WETH', address: '0xa', decimals: 18 },
    token1: { symbol: 'USDC', address: '0xb', decimals: 6 },
    feeTier: 0.003,
    price: 2500,
    tvl: 5_000_000,
    volume24h: 500_000,
    fees24h: 1500,
    apr: 25,
    bluechip: true,
    ...overrides,
  };
}

describe('ScoreService', () => {
  const service = new ScoreService({ health: 50, return: 40, risk: 25 });

  describe('calculateScore', () => {
    it('returns a score with all required fields', () => {
      const pool = makePool();
      const score = service.calculateScore(pool);

      expect(score).toHaveProperty('total');
      expect(score).toHaveProperty('health');
      expect(score).toHaveProperty('return');
      expect(score).toHaveProperty('risk');
      expect(score).toHaveProperty('breakdown');
      expect(score).toHaveProperty('recommendedMode');
      expect(score).toHaveProperty('isSuspect');
    });

    it('total score is between 0 and 100', () => {
      const pool = makePool();
      const score = service.calculateScore(pool);

      expect(score.total).toBeGreaterThanOrEqual(0);
      expect(score.total).toBeLessThanOrEqual(100);
    });

    it('high TVL + high volume pool scores well', () => {
      const pool = makePool({
        tvl: 50_000_000,
        volume24h: 10_000_000,
        fees24h: 30_000,
        apr: 40,
      });
      const score = service.calculateScore(pool);

      expect(score.total).toBeGreaterThan(50);
      expect(score.health).toBeGreaterThan(0);
      expect(score.return).toBeGreaterThan(0);
    });

    it('low TVL pool gets lower health score', () => {
      const highTvl = service.calculateScore(makePool({ tvl: 10_000_000 }));
      const lowTvl = service.calculateScore(makePool({ tvl: 50_000 }));

      expect(highTvl.health).toBeGreaterThan(lowTvl.health);
    });

    it('pool with zero TVL gets low score', () => {
      const pool = makePool({ tvl: 0, volume24h: 0, fees24h: 0, apr: 0 });
      const score = service.calculateScore(pool);

      expect(score.total).toBeLessThan(30);
    });

    it('flags suspect pool with abnormally high APR', () => {
      const pool = makePool({ apr: 1000 });
      const score = service.calculateScore(pool);

      expect(score.isSuspect).toBe(true);
      expect(score.suspectReason).toContain('high APR');
    });

    it('flags suspect pool with volume >> TVL', () => {
      const pool = makePool({ tvl: 100_000, volume24h: 2_000_000 });
      const score = service.calculateScore(pool);

      expect(score.isSuspect).toBe(true);
      expect(score.suspectReason).toContain('Volume/TVL');
    });

    it('recommends DEFENSIVE for low score pools', () => {
      const pool = makePool({ tvl: 30_000, volume24h: 500, apr: 2 });
      const score = service.calculateScore(pool);

      expect(score.recommendedMode).toBe('DEFENSIVE');
    });

    it('handles error gracefully and returns zero score', () => {
      // Pass null-ish values that might cause errors
      const pool = makePool({ tvl: NaN, volume24h: NaN });
      const score = service.calculateScore(pool);

      expect(score.total).toBeGreaterThanOrEqual(0);
      expect(score.total).toBeLessThanOrEqual(100);
    });
  });

  describe('score breakdown structure', () => {
    it('breakdown has health, return, and risk sections', () => {
      const pool = makePool();
      const score = service.calculateScore(pool);

      expect(score.breakdown.health).toHaveProperty('liquidityStability');
      expect(score.breakdown.health).toHaveProperty('ageScore');
      expect(score.breakdown.health).toHaveProperty('volumeConsistency');
      expect(score.breakdown.return).toHaveProperty('volumeTvlRatio');
      expect(score.breakdown.return).toHaveProperty('feeEfficiency');
      expect(score.breakdown.return).toHaveProperty('aprEstimate');
      expect(score.breakdown.risk).toHaveProperty('volatilityPenalty');
    });

    it('all breakdown values are non-negative', () => {
      const pool = makePool();
      const { breakdown } = service.calculateScore(pool);

      expect(breakdown.health.liquidityStability).toBeGreaterThanOrEqual(0);
      expect(breakdown.health.ageScore).toBeGreaterThanOrEqual(0);
      expect(breakdown.health.volumeConsistency).toBeGreaterThanOrEqual(0);
      expect(breakdown.return.volumeTvlRatio).toBeGreaterThanOrEqual(0);
      expect(breakdown.return.feeEfficiency).toBeGreaterThanOrEqual(0);
      expect(breakdown.return.aprEstimate).toBeGreaterThanOrEqual(0);
      expect(breakdown.risk.volatilityPenalty).toBeGreaterThanOrEqual(0);
    });
  });

  describe('score calibration — realistic pools should score appropriately', () => {
    it('$5M TVL bluechip pool with 10% volume/TVL scores >= 60', () => {
      const pool = makePool({
        tvl: 5_000_000,
        volume24h: 500_000,
        fees24h: 1500,
        apr: 25,
        bluechip: true,
      });
      const score = service.calculateScore(pool);
      expect(score.total).toBeGreaterThanOrEqual(60);
    });

    it('$1M TVL pool with healthy metrics scores >= 50', () => {
      const pool = makePool({
        tvl: 1_000_000,
        volume24h: 100_000,
        fees24h: 300,
        apr: 15,
        bluechip: false,
      });
      const score = service.calculateScore(pool);
      expect(score.total).toBeGreaterThanOrEqual(50);
    });

    it('$250k TVL pool with decent activity scores >= 40', () => {
      const pool = makePool({
        tvl: 250_000,
        volume24h: 25_000,
        fees24h: 75,
        apr: 20,
        bluechip: false,
      });
      const score = service.calculateScore(pool);
      expect(score.total).toBeGreaterThanOrEqual(40);
    });

    it('elite pool ($50M, high volume, bluechip) scores >= 75', () => {
      const pool = makePool({
        tvl: 50_000_000,
        volume24h: 15_000_000,
        fees24h: 50_000,
        apr: 40,
        bluechip: true,
      });
      const score = service.calculateScore(pool);
      expect(score.total).toBeGreaterThanOrEqual(75);
    });

    it('missing fee data does not crush the score below 30', () => {
      const pool = makePool({
        tvl: 2_000_000,
        volume24h: 200_000,
        fees24h: undefined as unknown as number,
        apr: 0,
        bluechip: true,
      });
      const score = service.calculateScore(pool);
      expect(score.total).toBeGreaterThanOrEqual(30);
    });

    it('unknown volatility does not penalize more than 2 points', () => {
      const pool = makePool();
      const score = service.calculateScore(pool);
      expect(score.breakdown.risk.volatilityPenalty).toBeLessThanOrEqual(2);
    });
  });
});
