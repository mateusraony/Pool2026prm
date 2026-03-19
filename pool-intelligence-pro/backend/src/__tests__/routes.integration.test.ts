import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ── Mock external dependencies ──
// vi.mock factories are hoisted — inline all return values (no outer variable refs)

vi.mock('../services/memory-store.service.js', () => ({
  memoryStore: {
    getAllPools: vi.fn().mockReturnValue([]),
    getScore: vi.fn().mockReturnValue(null),
    getRecommendations: vi.fn().mockReturnValue(null),
    setPools: vi.fn(),
    getStats: vi.fn().mockReturnValue({ pools: 0, scores: 0, watchlist: 0 }),
  },
}));

vi.mock('../services/score.service.js', () => ({
  scoreService: {
    calculateScore: vi.fn().mockReturnValue({
      overallScore: 75, tvlScore: 80, volumeScore: 70, aprScore: 65,
      volatilityScore: 60, trust: 85, risk: 'MEDIUM', flags: [], suspect: false,
    }),
  },
}));

vi.mock('../services/cache.service.js', () => ({
  cacheService: {
    get: vi.fn().mockReturnValue({ data: null }),
    set: vi.fn(),
    getStats: vi.fn().mockReturnValue({ size: 0, hits: 0, misses: 0 }),
  },
}));

vi.mock('../adapters/index.js', () => ({
  getPoolsWithFallback: vi.fn().mockResolvedValue({ pools: [], provider: 'mock' }),
  getPoolWithFallback: vi.fn().mockResolvedValue({ pool: null, provider: 'mock', usedFallback: false }),
  theGraphAdapter: {
    getPools: vi.fn().mockResolvedValue([]),
    getPool: vi.fn().mockResolvedValue(null),
    getPoolHistory: vi.fn().mockResolvedValue([]),
  },
  getAllProvidersHealth: vi.fn().mockResolvedValue([
    { name: 'DefiLlama', isHealthy: true, isOptional: false },
    { name: 'GeckoTerminal', isHealthy: true, isOptional: false },
  ]),
}));

vi.mock('../services/log.service.js', () => ({
  logService: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    getSummary: vi.fn().mockReturnValue({ INFO: 5, WARN: 1, ERROR: 0, CRITICAL: 0 }),
    getErrorCount: vi.fn().mockReturnValue(0),
  },
}));

vi.mock('../services/notification-settings.service.js', () => ({
  notificationSettingsService: {
    getSettings: vi.fn().mockReturnValue({
      notifications: { priceAlerts: true, newRecommendation: true, systemAlerts: true, dailyReport: false },
      dailyReportHour: 8, dailyReportMinute: 0,
    }),
    getTokenFilters: vi.fn().mockReturnValue([]),
    hasTokenFilter: vi.fn().mockReturnValue(false),
    matchesTokenFilter: vi.fn().mockReturnValue(true),
    isEnabled: vi.fn().mockReturnValue(true),
    getAppUrl: vi.fn().mockReturnValue('http://localhost:5173'),
  },
}));

vi.mock('../config/index.js', () => ({
  config: {
    nodeEnv: 'test', port: 3000,
    defaults: { mode: 'NORMAL', capital: 1000, chains: ['ethereum', 'arbitrum', 'base'] },
    telegram: { botToken: '', chatId: '', enabled: false },
  },
}));

vi.mock('../services/metrics.service.js', () => ({
  metricsService: {
    recordRequest: vi.fn(),
    recordJob: vi.fn(),
    getSnapshot: vi.fn().mockReturnValue({
      uptime: { seconds: 120, formatted: '0h 2m 0s' },
      memory: { rssMB: 50, heapUsedMB: 30, rssBytes: 50000000, heapUsedBytes: 30000000, heapTotalBytes: 40000000 },
      requests: { totalRequests: 10, totalErrors: 0, errorRate: 0, avgDurationMs: 50, byEndpoint: {} },
      jobs: {},
    }),
    getErrorRate: vi.fn().mockReturnValue(0),
    getMemoryUsage: vi.fn().mockReturnValue({ rssMB: 50, heapUsedMB: 30 }),
  },
}));

vi.mock('../services/pool-intelligence.service.js', () => ({
  poolIntelligenceService: {
    enrichToUnifiedPool: vi.fn().mockImplementation((pool: any) => ({
      id: pool?.externalId || 'test-pool', chain: pool?.chain || 'ethereum',
      protocol: pool?.protocol || 'uniswap-v3', poolAddress: pool?.poolAddress || '0xtest',
      token0: pool?.token0 || { symbol: 'WETH', name: 'Wrapped Ether' },
      token1: pool?.token1 || { symbol: 'USDC', name: 'USD Coin' },
      feeTier: pool?.feeTier || 0.003, price: pool?.price || 2500,
      tvlUSD: pool?.tvl || 5000000, volume24hUSD: pool?.volume24h || 1000000,
      fees24hUSD: pool?.fees24h || 5000, aprFee: 36.5, aprTotal: 36.5,
      healthScore: 75, volatilityAnn: 0.5, poolType: 'CL',
    })),
    applyPoolFilters: vi.fn().mockImplementation((pools: any[]) => pools),
    sortPools: vi.fn().mockImplementation((pools: any[]) => pools),
    getTokenList: vi.fn().mockReturnValue(['WETH', 'USDC', 'USDT', 'DAI']),
    buildTop3Recommendations: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../jobs/index.js', () => ({
  getLatestRadarResults: vi.fn().mockReturnValue([]),
  getLatestRecommendations: vi.fn().mockReturnValue([]),
  getMemoryStoreStats: vi.fn().mockReturnValue({ pools: 0, scores: 0 }),
}));

vi.mock('../services/alert.service.js', () => ({
  alertService: {
    getStats: vi.fn().mockReturnValue({ active: 0, triggered: 0 }),
    getAlerts: vi.fn().mockReturnValue([]),
    addAlert: vi.fn().mockReturnValue({ id: 'a1', type: 'price', condition: 'above', value: 3000 }),
    removeAlert: vi.fn().mockReturnValue(true),
    checkAlerts: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../routes/prisma.js', () => ({
  getPrisma: vi.fn().mockReturnValue({
    token: { findMany: vi.fn().mockResolvedValue([]) },
  }),
}));

// Mock Fase 6 services (weight-optimizer reads config at class-field init time)
vi.mock('../services/weight-optimizer.service.js', () => ({
  weightOptimizerService: {
    getCurrentWeights: vi.fn().mockReturnValue({ health: 40, return: 35, risk: 25 }),
    getLastAdjustedAt: vi.fn().mockReturnValue(null),
    autoAdjust: vi.fn().mockResolvedValue({
      before: { health: 40, return: 35, risk: 25 },
      after: { health: 40, return: 35, risk: 25 },
      reason: 'test',
      regimeBased: false,
    }),
    resetToDefaults: vi.fn().mockReturnValue({ health: 40, return: 35, risk: 25 }),
  },
}));

vi.mock('../services/decision-log.service.js', () => ({
  decisionLogService: {
    getEntries: vi.fn().mockReturnValue([]),
    getStats: vi.fn().mockReturnValue({ total: 0, byType: {} }),
    addEntry: vi.fn().mockReturnValue({ id: 'test-id', timestamp: new Date(), type: 'MANUAL', summary: 'test' }),
    logEvent: vi.fn(),
  },
}));

// Use real calc service for range-calc tests
vi.mock('../services/calc.service.js', async () => {
  return await vi.importActual('../services/calc.service.js');
});

// ── Imports AFTER mocks ──
import routes from '../routes/index.js';
import { memoryStore } from '../services/memory-store.service.js';

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', routes);
  return app;
}

// ── Tests ──

describe('GET /api/pools', () => {
  let app: express.Express;
  beforeEach(() => { vi.clearAllMocks(); app = createTestApp(); });

  it('returns success with empty pool list', async () => {
    const res = await request(app).get('/api/pools');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.pools)).toBe(true);
    expect(res.body.timestamp).toBeDefined();
  });

  it('returns pools from MemoryStore when available', async () => {
    vi.mocked(memoryStore.getAllPools).mockReturnValue([
      { id: 'pool-1', chain: 'ethereum', tvlUSD: 5000000 },
      { id: 'pool-2', chain: 'arbitrum', tvlUSD: 2000000 },
    ] as any);

    const res = await request(app).get('/api/pools');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pools).toHaveLength(2);
    expect(res.body.fromMemory).toBe(true);
  });

  it('respects pagination parameters', async () => {
    vi.mocked(memoryStore.getAllPools).mockReturnValue(
      Array.from({ length: 10 }, (_, i) => ({ id: `pool-${i}`, chain: 'ethereum', tvlUSD: 1000000 * (10 - i) })) as any
    );

    const res = await request(app).get('/api/pools?page=1&limit=3');
    expect(res.status).toBe(200);
    expect(res.body.pools).toHaveLength(3);
    expect(res.body.total).toBe(10);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(3);
  });

  it('caps limit at 200', async () => {
    const res = await request(app).get('/api/pools?limit=500');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(200);
  });

  it('includes tokenFilters in response', async () => {
    const res = await request(app).get('/api/pools');
    expect(res.body).toHaveProperty('tokenFilters');
  });
});

describe('GET /api/pools/:chain/:address', () => {
  let app: express.Express;
  beforeEach(() => { vi.clearAllMocks(); app = createTestApp(); });

  it('returns 404 when pool not found', async () => {
    const res = await request(app).get('/api/pools/ethereum/0xnotfound');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Pool not found');
  });

  it('returns pool from MemoryStore', async () => {
    vi.mocked(memoryStore.getAllPools).mockReturnValue([{
      id: '0xabc', chain: 'ethereum', poolAddress: '0xabc',
      token0: { symbol: 'WETH' }, token1: { symbol: 'USDC' },
      tvlUSD: 5000000, feeTier: 0.003, price: 2500, protocol: 'uniswap-v3',
    }] as any);

    const res = await request(app).get('/api/pools/ethereum/0xabc');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.provider).toBe('memory-store');
  });
});

describe('GET /api/recommendations', () => {
  let app: express.Express;
  beforeEach(() => { vi.clearAllMocks(); app = createTestApp(); });

  it('returns success with empty recommendations', async () => {
    const res = await request(app).get('/api/recommendations');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  });

  it('returns recommendations from MemoryStore', async () => {
    vi.mocked(memoryStore.getRecommendations).mockReturnValue([{
      pool: { externalId: 'p1', token0: { symbol: 'WETH' }, token1: { symbol: 'USDC' }, chain: 'ethereum' },
      mode: 'NORMAL', score: { overallScore: 85 }, recommendation: 'Strong pool',
    }] as any);

    const res = await request(app).get('/api/recommendations');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  it('respects limit parameter', async () => {
    vi.mocked(memoryStore.getRecommendations).mockReturnValue(
      Array.from({ length: 5 }, (_, i) => ({
        pool: { externalId: `p${i}`, token0: { symbol: 'ETH' }, token1: { symbol: 'USDC' } }, mode: 'NORMAL',
      })) as any
    );

    const res = await request(app).get('/api/recommendations?limit=2');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('caps limit at 20', async () => {
    vi.mocked(memoryStore.getRecommendations).mockReturnValue(
      Array.from({ length: 25 }, (_, i) => ({
        pool: { externalId: `p${i}`, token0: { symbol: 'ETH' }, token1: { symbol: 'USDC' } }, mode: 'NORMAL',
      })) as any
    );

    const res = await request(app).get('/api/recommendations?limit=30');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(20);
  });

  it('filters by mode', async () => {
    vi.mocked(memoryStore.getRecommendations).mockReturnValue([
      { pool: { externalId: 'p1', token0: { symbol: 'ETH' }, token1: { symbol: 'USDC' } }, mode: 'NORMAL' },
      { pool: { externalId: 'p2', token0: { symbol: 'ETH' }, token1: { symbol: 'DAI' } }, mode: 'AGGRESSIVE' },
      { pool: { externalId: 'p3', token0: { symbol: 'BTC' }, token1: { symbol: 'USDC' } }, mode: 'NORMAL' },
    ] as any);

    const res = await request(app).get('/api/recommendations?mode=NORMAL');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((r: any) => r.mode === 'NORMAL')).toBe(true);
  });
});

describe('GET /api/health', () => {
  let app: express.Express;
  beforeEach(() => { vi.clearAllMocks(); app = createTestApp(); });

  it('returns health status with provider info and metrics', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('HEALTHY');
    expect(res.body.providers).toBeDefined();
    expect(res.body.cache).toBeDefined();
    expect(res.body.memoryStore).toBeDefined();
    expect(res.body.uptime).toBeDefined();
    expect(res.body.memory).toBeDefined();
    expect(res.body.requests).toBeDefined();
    expect(res.body.jobs).toBeDefined();
    expect(res.body.logs).toBeDefined();
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('GET /api/tokens', () => {
  let app: express.Express;
  beforeEach(() => { vi.clearAllMocks(); app = createTestApp(); });

  it('returns token list for autocomplete', async () => {
    const res = await request(app).get('/api/tokens');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toContain('WETH');
    expect(res.body.data).toContain('USDC');
  });
});

describe('POST /api/range-calc', () => {
  let app: express.Express;
  beforeEach(() => { vi.clearAllMocks(); app = createTestApp(); });

  it('calculates range with valid input', async () => {
    const res = await request(app)
      .post('/api/range-calc')
      .send({ price: 2500, volAnn: 0.5, horizonDays: 7, riskMode: 'NORMAL', capital: 1000, tvl: 5000000, fees24h: 5000 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ranges.DEFENSIVE).toBeDefined();
    expect(res.body.data.ranges.NORMAL).toBeDefined();
    expect(res.body.data.ranges.AGGRESSIVE).toBeDefined();
    expect(res.body.data.selected.lower).toBeLessThan(2500);
    expect(res.body.data.selected.upper).toBeGreaterThan(2500);
    expect(res.body.data.ilRisk).toBeDefined();
  });

  it('rejects invalid input (missing required price)', async () => {
    const res = await request(app)
      .post('/api/range-calc')
      .send({ volAnn: 0.5 });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
