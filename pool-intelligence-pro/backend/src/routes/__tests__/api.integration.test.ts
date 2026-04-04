/**
 * Integration tests for critical API routes.
 * Uses Supertest against a minimal Express app with all heavy dependencies mocked.
 *
 * Covered routes:
 *   GET  /health                  — root-level health (db + memory)
 *   GET  /api/pools               — pool list
 *   GET  /api/recommendations     — recommendations
 *   GET  /api/alerts              — alert rules list
 *   POST /api/alerts              — create alert (Zod validation)
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import express from 'express';
import supertest from 'supertest';

// ── Mocks (hoisted — must reference no outer variables) ────────────────────

vi.mock('../../routes/prisma.js', () => ({
  getPrisma: vi.fn().mockReturnValue({
    $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    token: { findMany: vi.fn().mockResolvedValue([]) },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../services/memory-store.service.js', () => ({
  memoryStore: {
    getAllPools: vi.fn().mockReturnValue([]),
    getScore: vi.fn().mockReturnValue(null),
    getRecommendations: vi.fn().mockReturnValue(null),
    setPools: vi.fn(),
    getAllPoolsList: vi.fn().mockReturnValue([]),
    getStats: vi.fn().mockReturnValue({ pools: 0, scores: 0, watchlist: 0 }),
  },
}));

vi.mock('../../services/alert.service.js', () => ({
  alertService: {
    getRules: vi.fn().mockReturnValue([]),
    getRecentAlerts: vi.fn().mockReturnValue([]),
    addRule: vi.fn(),
    hasRule: vi.fn().mockReturnValue(false),
    removeRule: vi.fn(),
    getStats: vi.fn().mockReturnValue({ active: 0, triggered: 0 }),
    loadFromDb: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../services/cache.service.js', () => ({
  cacheService: {
    get: vi.fn().mockReturnValue({ data: null }),
    set: vi.fn(),
    getStats: vi.fn().mockReturnValue({ size: 0, hits: 0, misses: 0 }),
  },
}));

vi.mock('../../adapters/index.js', () => ({
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

vi.mock('../../services/log.service.js', () => ({
  logService: {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    getSummary: vi.fn().mockReturnValue({ INFO: 5, WARN: 1, ERROR: 0, CRITICAL: 0 }),
    getErrorCount: vi.fn().mockReturnValue(0),
  },
}));

vi.mock('../../services/metrics.service.js', () => ({
  metricsService: {
    recordRequest: vi.fn(),
    recordJob: vi.fn(),
    getSnapshot: vi.fn().mockReturnValue({
      uptime: { seconds: 120, formatted: '0h 2m 0s' },
      memory: { rssMB: 50, heapUsedMB: 30, rssBytes: 50_000_000, heapUsedBytes: 30_000_000, heapTotalBytes: 40_000_000 },
      requests: { totalRequests: 10, totalErrors: 0, errorRate: 0, avgDurationMs: 50, byEndpoint: {} },
      jobs: {},
    }),
    getErrorRate: vi.fn().mockReturnValue(0),
    getMemoryUsage: vi.fn().mockReturnValue({ rssMB: 50, heapUsedMB: 30 }),
  },
}));

vi.mock('../../services/notification-settings.service.js', () => ({
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

vi.mock('../../config/index.js', () => ({
  config: {
    nodeEnv: 'test',
    port: 3001,
    defaults: { mode: 'NORMAL', capital: 1000, chains: ['ethereum', 'arbitrum', 'base'] },
    telegram: { botToken: '', chatId: '', enabled: false },
  },
}));

vi.mock('../../services/pool-intelligence.service.js', () => ({
  poolIntelligenceService: {
    enrichToUnifiedPool: vi.fn().mockImplementation((pool: any) => ({
      id: pool?.externalId || 'test-pool',
      chain: pool?.chain || 'ethereum',
      protocol: pool?.protocol || 'uniswap-v3',
      poolAddress: pool?.poolAddress || '0xtest',
      token0: pool?.token0 || { symbol: 'WETH', name: 'Wrapped Ether' },
      token1: pool?.token1 || { symbol: 'USDC', name: 'USD Coin' },
      feeTier: pool?.feeTier || 0.003,
      price: pool?.price || 2500,
      tvlUSD: pool?.tvl || 5_000_000,
      volume24hUSD: pool?.volume24h || 1_000_000,
      fees24hUSD: pool?.fees24h || 5000,
      aprFee: 36.5, aprTotal: 36.5, healthScore: 75, volatilityAnn: 0.5, poolType: 'CL',
    })),
    applyPoolFilters: vi.fn().mockImplementation((pools: any[]) => pools),
    sortPools: vi.fn().mockImplementation((pools: any[]) => pools),
    getTokenList: vi.fn().mockReturnValue(['WETH', 'USDC', 'USDT', 'DAI']),
    buildTop3Recommendations: vi.fn().mockReturnValue([]),
  },
}));

vi.mock('../../jobs/index.js', () => ({
  getLatestRadarResults: vi.fn().mockReturnValue([]),
  getLatestRecommendations: vi.fn().mockReturnValue([]),
  getMemoryStoreStats: vi.fn().mockReturnValue({ pools: 0, scores: 0 }),
}));

vi.mock('../../services/weight-optimizer.service.js', () => ({
  weightOptimizerService: {
    getCurrentWeights: vi.fn().mockReturnValue({ health: 40, return: 35, risk: 25 }),
    getLastAdjustedAt: vi.fn().mockReturnValue(null),
    autoAdjust: vi.fn().mockResolvedValue({
      before: { health: 40, return: 35, risk: 25 },
      after: { health: 40, return: 35, risk: 25 },
      reason: 'test', regimeBased: false,
    }),
    resetToDefaults: vi.fn().mockReturnValue({ health: 40, return: 35, risk: 25 }),
  },
}));

vi.mock('../../services/decision-log.service.js', () => ({
  decisionLogService: {
    getEntries: vi.fn().mockReturnValue([]),
    getStats: vi.fn().mockReturnValue({ total: 0, byType: {} }),
    addEntry: vi.fn().mockReturnValue({ id: 'test-id', timestamp: new Date(), type: 'MANUAL', summary: 'test' }),
    logEvent: vi.fn(),
  },
}));

vi.mock('../../services/macro-calendar.service.js', () => ({
  macroCalendarService: {
    getMacroContext: vi.fn().mockReturnValue({ riskLevel: 'LOW', events: [] }),
    getUpcomingEvents: vi.fn().mockReturnValue([]),
    addEvent: vi.fn().mockReturnValue({ id: 'e1', name: 'Test', date: new Date() }),
    removeEvent: vi.fn().mockReturnValue(true),
  },
}));

vi.mock('../../services/market-regime.service.js', () => ({
  marketRegimeService: {
    getGlobalConditions: vi.fn().mockReturnValue({ regime: 'NEUTRAL', score: 50 }),
  },
}));

vi.mock('../../bot/telegram.js', () => ({
  telegramBot: {
    processWebhookUpdate: vi.fn().mockResolvedValue(undefined),
    loadFromDb: vi.fn(),
    setupCommands: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../services/calc.service.js', async () => {
  return await vi.importActual('../../services/calc.service.js');
});

// Remaining sub-router dependencies
vi.mock('../../services/range.service.js', () => ({
  rangeMonitorService: {
    getPositions: vi.fn().mockReturnValue([]),
    addPosition: vi.fn().mockReturnValue({ id: 'r1' }),
    removePosition: vi.fn().mockReturnValue(true),
    hasPosition: vi.fn().mockReturnValue(false),
    getStats: vi.fn().mockReturnValue({ total: 0, active: 0 }),
    loadFromDb: vi.fn().mockResolvedValue(undefined),
    checkRanges: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../services/price-history.service.js', () => ({
  priceHistoryService: {
    getPriceHistory: vi.fn().mockResolvedValue([]),
    addPriceSnapshot: vi.fn(),
  },
}));

vi.mock('../../services/score.service.js', () => ({
  scoreService: {
    calculateScore: vi.fn().mockReturnValue({
      overallScore: 75, tvlScore: 80, volumeScore: 70, aprScore: 65,
      volatilityScore: 60, trust: 85, risk: 'MEDIUM', flags: [], suspect: false,
    }),
  },
}));

vi.mock('../../services/websocket.service.js', () => ({
  wsService: { init: vi.fn(), emit: vi.fn() },
}));

vi.mock('../../services/push.service.js', () => ({
  pushService: {
    init: vi.fn().mockResolvedValue(undefined),
    getSubscriptions: vi.fn().mockReturnValue([]),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockReturnValue(true),
    getVapidPublicKey: vi.fn().mockReturnValue('mock-vapid-key'),
  },
}));

vi.mock('../../services/wallet.service.js', () => ({
  walletService: {
    init: vi.fn().mockResolvedValue(undefined),
    getTrackedWallets: vi.fn().mockReturnValue([]),
    addWallet: vi.fn().mockResolvedValue({ address: '0xtest' }),
    removeWallet: vi.fn().mockReturnValue(true),
  },
}));

vi.mock('../../routes/integrations.routes.js', () => {
  const { Router } = require('express');
  const r = Router();
  return { default: r, loadIntegrations: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('../../routes/ai-insights.routes.js', () => {
  const { Router } = require('express');
  return { default: Router() };
});

vi.mock('../../routes/history.routes.js', () => {
  const { Router } = require('express');
  return { default: Router() };
});

vi.mock('../../routes/docs.routes.js', () => {
  const { Router } = require('express');
  return { default: Router() };
});

vi.mock('../../routes/data.routes.js', () => {
  const { Router } = require('express');
  return { default: Router() };
});

vi.mock('../../routes/settings.routes.js', () => {
  const { Router } = require('express');
  return { default: Router() };
});

vi.mock('../../routes/wallet.routes.js', () => {
  const { Router } = require('express');
  return { default: Router() };
});

// ── Imports AFTER mocks ────────────────────────────────────────────────────

import routes from '../../routes/index.js';
import { getPrisma } from '../../routes/prisma.js';
import { alertService } from '../../services/alert.service.js';
import { memoryStore } from '../../services/memory-store.service.js';

// ── Test app factory ───────────────────────────────────────────────────────

function createTestApp() {
  const app = express();
  app.use(express.json());

  // Root-level /health (mirrors src/index.ts)
  app.get('/health', async (_req, res) => {
    const mem = process.memoryUsage();
    const memMb = Math.round(mem.rss / 1024 / 1024);
    const heapMb = Math.round(mem.heapUsed / 1024 / 1024);

    let dbStatus: 'ok' | 'unavailable' | 'unconfigured' = 'unconfigured';
    if (process.env.DATABASE_URL) {
      try {
        const prisma = getPrisma();
        await Promise.race([
          prisma.$queryRaw`SELECT 1`,
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
        ]);
        dbStatus = 'ok';
      } catch {
        dbStatus = 'unavailable';
      }
    }

    const healthy = dbStatus !== 'unavailable';
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      memory: { rss_mb: memMb, heap_mb: heapMb },
      db: dbStatus,
    });
  });

  app.use('/api', routes);
  return app;
}

// ── Test suites ────────────────────────────────────────────────────────────

describe('GET /health (root)', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeAll(() => { app = createTestApp(); });
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 with status ok when db is unconfigured (no DATABASE_URL)', async () => {
    const savedUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    const res = await supertest(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toMatch(/^(ok|degraded)$/);
    expect(res.body.db).toBe('unconfigured');
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.uptime).toBeTypeOf('number');
    expect(res.body.memory).toBeDefined();
    expect(res.body.memory.rss_mb).toBeTypeOf('number');

    if (savedUrl !== undefined) process.env.DATABASE_URL = savedUrl;
  });

  it('returns 200 with db:ok when DATABASE_URL is set and query succeeds', async () => {
    const savedUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';

    vi.mocked(getPrisma).mockReturnValue({
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
      token: { findMany: vi.fn().mockResolvedValue([]) },
      $disconnect: vi.fn().mockResolvedValue(undefined),
    } as any);

    const res = await supertest(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('ok');

    if (savedUrl !== undefined) process.env.DATABASE_URL = savedUrl;
    else delete process.env.DATABASE_URL;
  });

  it('returns 503 with status degraded when DATABASE_URL set but db unreachable', async () => {
    const savedUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://test:test@localhost/test';

    vi.mocked(getPrisma).mockReturnValue({
      $queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')),
      token: { findMany: vi.fn() },
      $disconnect: vi.fn(),
    } as any);

    const res = await supertest(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.db).toBe('unavailable');

    if (savedUrl !== undefined) process.env.DATABASE_URL = savedUrl;
    else delete process.env.DATABASE_URL;
  });
});

describe('GET /api/pools', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeAll(() => { app = createTestApp(); });
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 with success:true and data as array', async () => {
    const res = await supertest(app).get('/api/pools');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.pools)).toBe(true);
    expect(res.body.timestamp).toBeDefined();
  });

  it('returns pools from MemoryStore when available', async () => {
    vi.mocked(memoryStore.getAllPools).mockReturnValue([
      { id: 'pool-1', chain: 'ethereum', tvlUSD: 5_000_000 },
      { id: 'pool-2', chain: 'arbitrum', tvlUSD: 2_000_000 },
    ] as any);

    const res = await supertest(app).get('/api/pools');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pools).toHaveLength(2);
    expect(res.body.fromMemory).toBe(true);
  });
});

describe('GET /api/recommendations', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeAll(() => { app = createTestApp(); });
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 with success:true', async () => {
    const res = await supertest(app).get('/api/recommendations');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns recommendations when MemoryStore has data', async () => {
    vi.mocked(memoryStore.getRecommendations).mockReturnValue([
      {
        pool: { externalId: 'p1', token0: { symbol: 'WETH' }, token1: { symbol: 'USDC' }, chain: 'ethereum' },
        mode: 'NORMAL', score: { overallScore: 85 }, recommendation: 'Strong pool',
      },
    ] as any);

    const res = await supertest(app).get('/api/recommendations');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/alerts', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeAll(() => { app = createTestApp(); });
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 200 with success:true and rules + recentAlerts', async () => {
    const res = await supertest(app).get('/api/alerts');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.rules)).toBe(true);
    expect(Array.isArray(res.body.data.recentAlerts)).toBe(true);
  });

  it('returns rules from alertService', async () => {
    vi.mocked(alertService.getRules).mockReturnValue([
      { id: 'rule-1', type: 'PRICE_ABOVE', value: 3000, triggerCount: 0 },
    ] as any);

    const res = await supertest(app).get('/api/alerts');

    expect(res.status).toBe(200);
    expect(res.body.data.rules).toHaveLength(1);
    expect(res.body.data.rules[0]).toMatchObject({ type: 'PRICE_ABOVE' });
  });
});

describe('POST /api/alerts — Zod validation', () => {
  let app: ReturnType<typeof createTestApp>;

  beforeAll(() => { app = createTestApp(); });
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns 400 when body is empty', async () => {
    const res = await supertest(app)
      .post('/api/alerts')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });

  it('returns 400 when type is invalid', async () => {
    const res = await supertest(app)
      .post('/api/alerts')
      .send({ type: 'PRICE_DROP', threshold: 5 }); // PRICE_DROP is not in ALERT_TYPE_VALUES

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when threshold is missing', async () => {
    const res = await supertest(app)
      .post('/api/alerts')
      .send({ type: 'PRICE_ABOVE' }); // missing threshold

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when threshold is negative', async () => {
    const res = await supertest(app)
      .post('/api/alerts')
      .send({ type: 'PRICE_ABOVE', threshold: -1 });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 200/201 for valid alert (type=PRICE_ABOVE, threshold=3000)', async () => {
    const res = await supertest(app)
      .post('/api/alerts')
      .send({ type: 'PRICE_ABOVE', threshold: 3000 });

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
  });

  it('returns 200/201 for valid alert (type=PRICE_BELOW, threshold=1000)', async () => {
    const res = await supertest(app)
      .post('/api/alerts')
      .send({ type: 'PRICE_BELOW', threshold: 1000 });

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
  });

  it('returns 400 for OUT_OF_RANGE without condition', async () => {
    const res = await supertest(app)
      .post('/api/alerts')
      .send({ type: 'OUT_OF_RANGE', threshold: 0 }); // missing required condition

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 200/201 for OUT_OF_RANGE with condition', async () => {
    const res = await supertest(app)
      .post('/api/alerts')
      .send({
        type: 'OUT_OF_RANGE',
        threshold: 0,
        condition: { rangeLower: 1800, rangeUpper: 2200 },
      });

    expect([200, 201]).toContain(res.status);
    expect(res.body.success).toBe(true);
  });
});
