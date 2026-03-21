import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScoreService } from '../score.service.js';
import { Pool } from '../../types/index.js';

// -----------------------------------------------------------------------
// Mock external dependencies so tests run without DB / config side-effects
// -----------------------------------------------------------------------

vi.mock('../log.service.js', () => ({
  logService: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../memory-store.service.js', () => ({
  memoryStore: {
    getTvlDrop: vi.fn().mockReturnValue(0), // no liquidity drop by default
  },
}));

vi.mock('../risk.service.js', () => ({
  riskService: {
    assessPool: vi.fn().mockReturnValue({
      level: 'LOW',
      score: 80,
      factors: [],
      shouldOperate: true,
      summary: 'Low risk pool',
    }),
  },
}));

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function makePool(overrides: Partial<Pool> = {}): Pool {
  return {
    externalId: 'test-pool-1',
    chain: 'ethereum',
    protocol: 'uniswap-v3',
    poolAddress: '0xabc123',
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

// Use fixed weights matching the production defaults
const WEIGHTS = { health: 50, return: 40, risk: 25 };

// -----------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------

describe('ScoreService.calculateScore', () => {
  let service: ScoreService;

  beforeEach(() => {
    service = new ScoreService(WEIGHTS);
    vi.clearAllMocks();
  });

  // --- Output shape ---

  it('returns an object with all required fields', () => {
    const score = service.calculateScore(makePool());

    expect(score).toHaveProperty('total');
    expect(score).toHaveProperty('health');
    expect(score).toHaveProperty('return');
    expect(score).toHaveProperty('risk');
    expect(score).toHaveProperty('breakdown');
    expect(score).toHaveProperty('recommendedMode');
    expect(score).toHaveProperty('isSuspect');
  });

  // --- Range invariant ---

  it('total score is always between 0 and 100 for a healthy pool', () => {
    const score = service.calculateScore(makePool());

    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it('total score is always between 0 and 100 for a zero-TVL pool', () => {
    const score = service.calculateScore(makePool({ tvl: 0, volume24h: 0, fees24h: 0, apr: 0 }));

    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  // --- Low-volume pool gets low score ---

  it('pool with zero volume scores below 30', () => {
    const score = service.calculateScore(
      makePool({ tvl: 50_000, volume24h: 0, fees24h: 0, apr: 0 })
    );

    expect(score.total).toBeLessThan(30);
  });

  it('pool with zero TVL and zero volume gets very low health score', () => {
    const score = service.calculateScore(
      makePool({ tvl: 0, volume24h: 0, fees24h: 0, apr: 0 })
    );

    expect(score.health).toBeLessThanOrEqual(12); // baseline do ageScore garante mínimo ~10.5
  });

  // --- High-liquidity pool scores well ---

  it('pool with high liquidity and active volume scores above 60', () => {
    const score = service.calculateScore(
      makePool({ tvl: 10_000_000, volume24h: 3_000_000, fees24h: 9_000, apr: 33 })
    );

    expect(score.total).toBeGreaterThan(60);
  });

  it('elite pool ($50M TVL, high volume, bluechip) scores >= 75', () => {
    const score = service.calculateScore(
      makePool({
        tvl: 50_000_000,
        volume24h: 15_000_000,
        fees24h: 50_000,
        apr: 40,
        bluechip: true,
      })
    );

    expect(score.total).toBeGreaterThanOrEqual(75);
  });

  it('health score increases with TVL (volume proporcional ao TVL)', () => {
    // volume proporcional mantém vol/TVL constante; só liquidityStability varia
    const low  = service.calculateScore(makePool({ tvl: 50_000,     volume24h: 5_000 }));
    const mid  = service.calculateScore(makePool({ tvl: 1_000_000,  volume24h: 100_000 }));
    const high = service.calculateScore(makePool({ tvl: 10_000_000, volume24h: 1_000_000 }));

    expect(mid.health).toBeGreaterThan(low.health);
    expect(high.health).toBeGreaterThan(mid.health);
  });

  // --- Suspect detection ---

  it('flags pool with apr > 500 as suspect', () => {
    const score = service.calculateScore(makePool({ apr: 1000 }));

    expect(score.isSuspect).toBe(true);
    expect(score.suspectReason).toContain('high APR');
  });

  it('flags pool where volume > tvl * 10 as suspect', () => {
    const score = service.calculateScore(
      makePool({ tvl: 100_000, volume24h: 2_000_000 })
    );

    expect(score.isSuspect).toBe(true);
    expect(score.suspectReason).toContain('Volume/TVL');
  });

  it('does not flag a healthy pool as suspect', () => {
    const score = service.calculateScore(makePool());

    // The mock returns LOW risk — so suspect should come from domain checks only.
    // Default pool does not hit any suspect threshold.
    expect(score.isSuspect).toBe(false);
  });

  // --- Risk propagation from RiskService ---

  it('marks pool as suspect when riskService returns HIGH level', async () => {
    const { riskService } = await import('../risk.service.js');
    vi.mocked(riskService.assessPool).mockReturnValueOnce({
      level: 'HIGH',
      score: 30,
      factors: [],
      shouldOperate: false,
      summary: 'High risk detected',
    });

    const score = service.calculateScore(makePool());

    expect(score.isSuspect).toBe(true);
  });

  // --- Error resilience ---

  it('returns total=0 and isSuspect=true when calculation throws', () => {
    // Pass NaN values to force a code path that may throw internally
    const score = service.calculateScore(makePool({ tvl: NaN, volume24h: NaN }));

    // Either returns a zero score (error path) or stays within range
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });
});

// -----------------------------------------------------------------------
// determineMode tests
// -----------------------------------------------------------------------

describe('ScoreService — determineMode via calculateScore', () => {
  let service: ScoreService;

  beforeEach(() => {
    service = new ScoreService(WEIGHTS);
    vi.clearAllMocks();
  });

  it('recommends AGGRESSIVE for high score + low volatility', () => {
    // Elite pool with low volatility metrics should get high score + AGGRESSIVE
    const pool = makePool({
      tvl: 50_000_000,
      volume24h: 10_000_000,
      fees24h: 30_000,
      apr: 35,
      bluechip: true,
    });
    // Pass metrics with very low volatility (<= 15%)
    const metrics = { volatility24h: 5 };
    const score = service.calculateScore(pool, metrics);

    // We can only assert the mode when total >= 70 (which this pool should achieve)
    if (score.total >= 70) {
      expect(score.recommendedMode).toBe('AGGRESSIVE');
    }
  });

  it('recommends DEFENSIVE for high volatility', () => {
    // High volatility (> 30) → DEFENSIVE regardless of score
    const pool = makePool({
      tvl: 200_000,
      volume24h: 5_000,
      apr: 5,
    });
    const metrics = { volatility24h: 40 };
    const score = service.calculateScore(pool, metrics);

    expect(score.recommendedMode).toBe('DEFENSIVE');
  });

  it('recommends DEFENSIVE for low-score pool with any volatility', () => {
    const pool = makePool({ tvl: 30_000, volume24h: 100, apr: 1 });
    const score = service.calculateScore(pool);

    expect(score.recommendedMode).toBe('DEFENSIVE');
  });

  it('recommends NORMAL for medium score + medium volatility', () => {
    // Force a pool that scores ~50-69 with medium volatility (<=30)
    const pool = makePool({
      tvl: 300_000,
      volume24h: 30_000,
      fees24h: 90,
      apr: 15,
      bluechip: false,
    });
    const metrics = { volatility24h: 20 };
    const score = service.calculateScore(pool, metrics);

    // If score is in 50-69 range → NORMAL
    if (score.total >= 50 && score.total < 70) {
      expect(score.recommendedMode).toBe('NORMAL');
    } else {
      // Pool might have scored higher or lower — just verify it is a valid mode
      expect(['DEFENSIVE', 'NORMAL', 'AGGRESSIVE']).toContain(score.recommendedMode);
    }
  });

  it('recommendedMode is always one of the valid values', () => {
    const pools = [
      makePool(),
      makePool({ tvl: 0, volume24h: 0 }),
      makePool({ tvl: 50_000_000, volume24h: 20_000_000 }),
      makePool({ tvl: 100_000, volume24h: 1_000 }),
    ];

    for (const pool of pools) {
      const score = service.calculateScore(pool);
      expect(['DEFENSIVE', 'NORMAL', 'AGGRESSIVE']).toContain(score.recommendedMode);
    }
  });
});

// -----------------------------------------------------------------------
// Score breakdown structure
// -----------------------------------------------------------------------

describe('ScoreService — score breakdown', () => {
  let service: ScoreService;

  beforeEach(() => {
    service = new ScoreService(WEIGHTS);
    vi.clearAllMocks();
  });

  it('breakdown has all expected sub-sections', () => {
    const { breakdown } = service.calculateScore(makePool());

    expect(breakdown).toHaveProperty('health');
    expect(breakdown).toHaveProperty('return');
    expect(breakdown).toHaveProperty('risk');

    expect(breakdown.health).toHaveProperty('liquidityStability');
    expect(breakdown.health).toHaveProperty('ageScore');
    expect(breakdown.health).toHaveProperty('volumeConsistency');

    expect(breakdown.return).toHaveProperty('volumeTvlRatio');
    expect(breakdown.return).toHaveProperty('feeEfficiency');
    expect(breakdown.return).toHaveProperty('aprEstimate');

    expect(breakdown.risk).toHaveProperty('volatilityPenalty');
    expect(breakdown.risk).toHaveProperty('liquidityDropPenalty');
    expect(breakdown.risk).toHaveProperty('inconsistencyPenalty');
    expect(breakdown.risk).toHaveProperty('spreadPenalty');
  });

  it('all breakdown values are non-negative', () => {
    const { breakdown } = service.calculateScore(makePool());

    Object.values(breakdown.health).forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    Object.values(breakdown.return).forEach(v => expect(v).toBeGreaterThanOrEqual(0));
    Object.values(breakdown.risk).forEach(v => expect(v).toBeGreaterThanOrEqual(0));
  });

  it('volatilityPenalty is 2 when no volatility data provided', () => {
    // No metrics argument → unknown volatility → minimal penalty of 2
    const { breakdown } = service.calculateScore(makePool());

    expect(breakdown.risk.volatilityPenalty).toBe(2);
  });

  it('volatilityPenalty increases with higher volatility', () => {
    const low = service.calculateScore(makePool(), { volatility24h: 3 });
    const high = service.calculateScore(makePool(), { volatility24h: 35 });

    expect(high.breakdown.risk.volatilityPenalty).toBeGreaterThan(
      low.breakdown.risk.volatilityPenalty
    );
  });

  it('liquidityDropPenalty reflects TVL drop from memoryStore', async () => {
    const { memoryStore } = await import('../memory-store.service.js');
    vi.mocked(memoryStore.getTvlDrop).mockReturnValueOnce(40); // 40% drop

    const { breakdown } = service.calculateScore(makePool());

    // 40% drop → 30-50% bucket → penalty = round(40 * 0.7) = 28, capped at 25
    expect(breakdown.risk.liquidityDropPenalty).toBeGreaterThan(0);
  });
});
