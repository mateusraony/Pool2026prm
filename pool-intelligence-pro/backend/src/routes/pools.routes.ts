import { Router } from 'express';
import { getPoolsWithFallback, getPoolWithFallback, theGraphAdapter } from '../adapters/index.js';
import { scoreService } from '../services/score.service.js';
import { cacheService } from '../services/cache.service.js';
import { logService } from '../services/log.service.js';
import { notificationSettingsService } from '../services/notification-settings.service.js';
import {
  getLatestRadarResults,
  getLatestRecommendations,
} from '../jobs/index.js';
import { memoryStore } from '../services/memory-store.service.js';
import { config } from '../config/index.js';
import { poolIntelligenceService } from '../services/pool-intelligence.service.js';
import { calcRangeRecommendation, calcUserFees, calcILRisk } from '../services/calc.service.js';
import { Pool, UnifiedPool } from '../types/index.js';
import { validate, rangeCalcSchema } from './validation.js';
import { getPrisma } from './prisma.js';

const router = Router();

// Get pools (radar results) — lê do MemoryStore primeiro (sem recalcular)
router.get('/pools', async (req, res) => {
  try {
    const {
      chain, protocol, token, bluechip, poolType,
      sortBy = 'tvl', sortDirection = 'desc',
      page, limit: limitStr,
      minTVL, minHealth,
    } = req.query;

    // ── 1. Tenta servir do MemoryStore (path rápido — sem API externa) ──
    let pools = memoryStore.getAllPools();
    let fromMemory = pools.length > 0;

    if (!fromMemory) {
      // ── 2. Cold-start: MemoryStore vazio → monta de radarResults + TheGraph ──
      const radarResults = getLatestRadarResults();

      // TheGraph supplement (background, non-blocking)
      const theGraphKey = `thegraph_unified_${chain || 'all'}`;
      let theGraphUnified = cacheService.get<UnifiedPool[]>(theGraphKey).data;
      if (!theGraphUnified && !cacheService.get(`thegraph_fetching_${chain || 'all'}`).data) {
        cacheService.set(`thegraph_fetching_${chain || 'all'}`, true, 60);
        const chainsToFetch = chain ? [chain as string] : ['ethereum', 'arbitrum', 'base'];
        Promise.all(chainsToFetch.map(c => theGraphAdapter.getPools(c, 50))).then(results => {
          const allPools = results.flat();
          const unified = allPools.map(p => poolIntelligenceService.enrichToUnifiedPool(p, { updatedAt: new Date() }));
          memoryStore.setPools(unified);
          cacheService.set(theGraphKey, unified, 300);
        }).catch(() => {});
      }

      const radarUnified: UnifiedPool[] = radarResults.map(r =>
        poolIntelligenceService.enrichToUnifiedPool(r.pool, { updatedAt: new Date() })
      );

      const tgUnified = theGraphUnified ?? [];
      const mergedMap = new Map<string, UnifiedPool>();
      for (const p of radarUnified) mergedMap.set(p.id, p);
      for (const p of tgUnified) {
        if (!mergedMap.has(p.id) || p.volume1hUSD != null) mergedMap.set(p.id, p);
      }
      pools = Array.from(mergedMap.values());

      if (pools.length > 0) memoryStore.setPools(pools);
    }

    // ── 3. Filtros e ordenação ──
    pools = poolIntelligenceService.applyPoolFilters(pools, {
      chain: chain as string | undefined,
      protocol: protocol as string | undefined,
      token: token as string | undefined,
      bluechip: bluechip === 'true' ? true : undefined,
      minTVL: minTVL ? parseFloat(minTVL as string) : undefined,
      minHealth: minHealth ? parseFloat(minHealth as string) : undefined,
      poolType: poolType as string | undefined,
    });

    const validSortKeys = ['tvl', 'apr', 'aprFee', 'aprAdjusted', 'volume1h', 'volume5m', 'fees1h', 'fees5m', 'healthScore', 'volatilityAnn', 'ratio'] as const;
    type SortKey = typeof validSortKeys[number];
    const sortKey = (validSortKeys.includes(sortBy as SortKey) ? sortBy : 'tvl') as SortKey;
    pools = poolIntelligenceService.sortPools(pools, sortKey, (sortDirection as string) === 'asc' ? 'asc' : 'desc');

    // ── 4. Paginação ──
    const total = pools.length;
    const lim = limitStr ? Math.min(parseInt(limitStr as string), 200) : 50;
    const pg = page ? parseInt(page as string) : null;
    pools = pg != null
      ? pools.slice((pg - 1) * lim, pg * lim)
      : pools.slice(0, lim);

    res.json({
      success: true,
      pools,
      total,
      page: pg,
      limit: lim,
      fromMemory,
      syncing: !!cacheService.get(`thegraph_fetching_${chain || 'all'}`).data,
      tokenFilters: notificationSettingsService.getTokenFilters(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'GET /pools failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Get single pool
router.get('/pools/:chain/:address', async (req, res) => {
  try {
    const { chain, address } = req.params;

    const radarResults = getLatestRadarResults();
    const fromRadar = radarResults.find(r =>
      r.pool.chain === chain &&
      (r.pool.poolAddress === address || r.pool.externalId === address)
    );

    if (fromRadar) {
      return res.json({
        success: true,
        data: { pool: fromRadar.pool, score: fromRadar.score },
        provider: 'radar-cache',
        usedFallback: false,
        timestamp: new Date(),
      });
    }

    const memUnified = memoryStore.getAllPools().find(p =>
      p.chain === chain && (p.poolAddress === address || p.id === address)
    );
    if (memUnified) {
      const pool: Pool = {
        externalId: memUnified.id,
        chain: memUnified.chain,
        protocol: memUnified.protocol,
        poolAddress: memUnified.poolAddress,
        token0: memUnified.token0,
        token1: memUnified.token1,
        feeTier: memUnified.feeTier,
        price: memUnified.price,
        tvl: memUnified.tvlUSD,
        volume24h: memUnified.volume24hUSD || 0,
        volume7d: (memUnified as any).volume7d,
        fees24h: memUnified.fees24hUSD ?? 0,
        apr: memUnified.aprTotal ?? memUnified.aprFee ?? (memUnified as any).apr ?? 0,
        volatilityAnn: memUnified.volatilityAnn,
      } as Pool;
      const cachedScore = memoryStore.getScore(memUnified.id);
      const score = cachedScore || scoreService.calculateScore(pool);
      return res.json({
        success: true,
        data: { pool, score },
        provider: 'memory-store',
        usedFallback: false,
        timestamp: new Date(),
      });
    }

    const { pool, provider, usedFallback } = await getPoolWithFallback(chain, address);

    if (!pool) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    const score = scoreService.calculateScore(pool);

    res.json({
      success: true,
      data: { pool, score },
      provider,
      usedFallback,
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'GET /pools/:chain/:address failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Get recommendations
router.get('/recommendations', async (req, res) => {
  try {
    const { mode, limit, tokens, useTokenFilter } = req.query;
    let recommendations = memoryStore.getRecommendations() ?? getLatestRecommendations();

    const shouldUseSettingsFilter = useTokenFilter === 'true' || useTokenFilter === '1';
    const tokenFilterFromQuery = tokens ? (tokens as string).split(',').map(t => t.trim().toUpperCase()) : null;

    if (shouldUseSettingsFilter && notificationSettingsService.hasTokenFilter()) {
      recommendations = recommendations.filter(r =>
        notificationSettingsService.matchesTokenFilter(r.pool.token0.symbol, r.pool.token1.symbol)
      );
    } else if (tokenFilterFromQuery && tokenFilterFromQuery.length > 0) {
      recommendations = recommendations.filter(r => {
        const t0 = r.pool.token0.symbol.toUpperCase();
        const t1 = r.pool.token1.symbol.toUpperCase();
        return tokenFilterFromQuery.some(f => f === t0 || f === t1);
      });
    }

    if (mode && typeof mode === 'string') {
      recommendations = recommendations.filter(r => r.mode === mode.toUpperCase());
    }

    const maxLimit = Math.min(parseInt(limit as string) || 10, 20);
    recommendations = recommendations.slice(0, maxLimit);

    res.json({
      success: true,
      data: recommendations,
      total: getLatestRecommendations().length,
      filteredTotal: recommendations.length,
      mode: config.defaults.mode,
      capital: config.defaults.capital,
      tokenFilters: notificationSettingsService.getTokenFilters(),
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'GET /recommendations failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// GET /api/tokens — token list for autocomplete
router.get('/tokens', async (req, res) => {
  try {
    const tokens = poolIntelligenceService.getTokenList();
    try {
      const dbTokens = await getPrisma().token.findMany({ select: { symbol: true }, distinct: ['symbol'], take: 500 });
      const extra = dbTokens.map((t: { symbol: string }) => t.symbol.toUpperCase());
      const merged = Array.from(new Set([...tokens, ...extra])).sort();
      return res.json(merged);
    } catch {
      return res.json(tokens);
    }
  } catch (error) {
    logService.error('SYSTEM', 'GET /tokens failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// GET /api/pools-detail/:chain/:address — enhanced with history and range data
router.get('/pools-detail/:chain/:address', async (req, res) => {
  try {
    const { chain, address } = req.params;
    const { horizonDays = '7', riskMode = 'NORMAL', capital = '1000' } = req.query;

    let pool = await theGraphAdapter.getPool(chain, address);
    let history = pool ? await theGraphAdapter.getPoolHistory(chain, address, 7) : [];
    let provider = 'thegraph';

    if (!pool) {
      const result = await getPoolWithFallback(chain, address);
      pool = result.pool;
      provider = result.provider;
    }

    if (!pool) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    const unified = poolIntelligenceService.enrichToUnifiedPool(pool, { updatedAt: new Date() });
    const score = scoreService.calculateScore(pool);

    const horizonD = parseInt(horizonDays as string) || 7;
    const capUSD = parseFloat(capital as string) || 1000;
    const p = pool.price || 1;
    const vol = unified.volatilityAnn;
    const tickSpacing = (pool as Pool & { tickSpacing?: number }).tickSpacing;

    const ranges = {
      DEFENSIVE: calcRangeRecommendation({ price: p, volAnn: vol, horizonDays: horizonD, riskMode: 'DEFENSIVE', tickSpacing, poolType: unified.poolType }),
      NORMAL: calcRangeRecommendation({ price: p, volAnn: vol, horizonDays: horizonD, riskMode: 'NORMAL', tickSpacing, poolType: unified.poolType }),
      AGGRESSIVE: calcRangeRecommendation({ price: p, volAnn: vol, horizonDays: horizonD, riskMode: 'AGGRESSIVE', tickSpacing, poolType: unified.poolType }),
    };

    const selectedRange = ranges[(riskMode as string).toUpperCase() as 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE'] || ranges.NORMAL;

    const feeEstimates = {
      DEFENSIVE: calcUserFees({ tvl: pool.tvl, fees24h: pool.fees24h, fees1h: (pool as Pool & { fees1h?: number }).fees1h, userCapital: capUSD, riskMode: 'DEFENSIVE' }),
      NORMAL: calcUserFees({ tvl: pool.tvl, fees24h: pool.fees24h, fees1h: (pool as Pool & { fees1h?: number }).fees1h, userCapital: capUSD, riskMode: 'NORMAL' }),
      AGGRESSIVE: calcUserFees({ tvl: pool.tvl, fees24h: pool.fees24h, fees1h: (pool as Pool & { fees1h?: number }).fees1h, userCapital: capUSD, riskMode: 'AGGRESSIVE' }),
    };

    const ilRisk = calcILRisk({
      price: p,
      rangeLower: selectedRange.lower,
      rangeUpper: selectedRange.upper,
      volAnn: vol,
      horizonDays: horizonD,
    });

    res.json({
      success: true,
      data: {
        pool: unified,
        score,
        history: history.slice(0, 168),
        ranges,
        selectedRange,
        feeEstimates,
        ilRisk,
        recommendations: poolIntelligenceService.buildTop3Recommendations([unified]),
      },
      provider,
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'GET /pools-detail/:chain/:address failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// POST /api/range-calc — standalone range calculator
router.post('/range-calc', validate(rangeCalcSchema), async (req, res) => {
  try {
    const { price, volAnn, horizonDays, riskMode, tickSpacing, poolType, capital, tvl, fees24h } = req.body;

    const ranges = {
      DEFENSIVE: calcRangeRecommendation({ price, volAnn, horizonDays, riskMode: 'DEFENSIVE', tickSpacing, poolType }),
      NORMAL: calcRangeRecommendation({ price, volAnn, horizonDays, riskMode: 'NORMAL', tickSpacing, poolType }),
      AGGRESSIVE: calcRangeRecommendation({ price, volAnn, horizonDays, riskMode: 'AGGRESSIVE', tickSpacing, poolType }),
    };

    const selected = ranges[(riskMode as string).toUpperCase() as 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE'] || ranges.NORMAL;

    const feeEstimate = calcUserFees({ tvl: tvl || 0, fees24h, userCapital: capital, riskMode: riskMode as 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE' });
    const ilRisk = calcILRisk({ price, rangeLower: selected.lower, rangeUpper: selected.upper, volAnn, horizonDays });

    res.json({ success: true, data: { ranges, selected, feeEstimate, ilRisk } });
  } catch (error) {
    logService.error('SYSTEM', 'POST /range-calc failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

export default router;
