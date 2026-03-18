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
import {
  calcRangeRecommendation, calcUserFees, calcILRisk, calcMonteCarlo, calcBacktest, calcLVR,
  calcPortfolioAnalytics, calcAutoCompound, calcTokenCorrelation,
  type PortfolioPosition,
} from '../services/calc.service.js';
import { Pool, UnifiedPool } from '../types/index.js';
import { rangeMonitorService } from '../services/range.service.js';
import { priceHistoryService } from '../services/price-history.service.js';
import { validate, rangeCalcSchema, monteCarloSchema, backtestSchema, lvrSchema, autoCompoundSchema } from './validation.js';
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
        }).catch((err) => {
          logService.warn('POOLS', 'Background TheGraph refresh failed', { error: String(err) });
        });
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

    const score = memoryStore.getScore(pool.externalId) || scoreService.calculateScore(pool);

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

    // Also try GeckoTerminal OHLCV if TheGraph history is empty
    if (history.length === 0) {
      try {
        const { geckoTerminalAdapter } = await import('../adapters/index.js');
        const geckoHistory = await geckoTerminalAdapter.getPoolHistory(chain, address, 30);
        if (geckoHistory.length > 0) history = geckoHistory;
      } catch { /* ignore — use proxy volatility */ }
    }

    const unified = poolIntelligenceService.enrichToUnifiedPool(pool, { updatedAt: new Date(), history });
    const score = memoryStore.getScore(pool.externalId) || scoreService.calculateScore(pool);

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

// GET /api/pools-liquidity/:chain/:address — liquidity distribution data
router.get('/pools-liquidity/:chain/:address', async (req, res) => {
  try {
    const { chain, address } = req.params;
    const { bars: barsStr = '50' } = req.query;
    const numBars = Math.min(Math.max(parseInt(barsStr as string) || 50, 20), 100);

    // Find pool data from memory/radar
    const radarResults = getLatestRadarResults();
    const fromRadar = radarResults.find(r =>
      r.pool.chain === chain &&
      (r.pool.poolAddress === address || r.pool.externalId === address)
    );

    const memUnified = memoryStore.getAllPools().find(p =>
      p.chain === chain && (p.poolAddress === address || p.id === address)
    );

    const price = fromRadar?.pool.price || memUnified?.price || 1;
    const tvl = fromRadar?.pool.tvl || memUnified?.tvlUSD || 0;
    const vol = memUnified?.volatilityAnn || 0.3;

    // NOTE: Synthetic liquidity distribution (Gaussian model)
    // Real on-chain tick liquidity requires subgraph queries not yet implemented
    const sigma = price * vol * 0.5; // half-year volatility as spread
    const rangeMin = price * (1 - vol * 0.8);
    const rangeMax = price * (1 + vol * 0.8);
    const step = (rangeMax - rangeMin) / numBars;

    const bars = [];
    let maxLiq = 0;

    for (let i = 0; i < numBars; i++) {
      const barPrice = rangeMin + (i + 0.5) * step;
      // Gaussian distribution centered on current price
      const z = (barPrice - price) / sigma;
      const gaussian = Math.exp(-0.5 * z * z);
      // Add some realistic noise (seeded by price position for consistency)
      const seed = Math.sin(barPrice * 12345.6789) * 0.5 + 0.5;
      const noise = 1 + (seed - 0.5) * 0.3;
      const liquidity = gaussian * noise * tvl;
      if (liquidity > maxLiq) maxLiq = liquidity;
      bars.push({ price: barPrice, liquidity });
    }

    // Normalize to 0-100 scale
    const normalizedBars = bars.map(b => ({
      price: Math.round(b.price * 10000) / 10000,
      liquidity: maxLiq > 0 ? Math.round((b.liquidity / maxLiq) * 100) : 50,
    }));

    res.json({
      success: true,
      data: {
        bars: normalizedBars,
        currentPrice: price,
        tvl,
        volatility: vol,
        rangeMin,
        rangeMax,
        synthetic: true,
        disclaimer: 'Liquidity distribution is estimated (Gaussian model). Real tick-level data requires on-chain subgraph integration.',
      },
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'GET /pools-liquidity/:chain/:address failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// POST /api/monte-carlo — Monte Carlo simulation
router.post('/monte-carlo', validate(monteCarloSchema), async (req, res) => {
  try {
    const { chain, address, capital = 10000, horizonDays = 30, scenarios = 1000, mode = 'NORMAL' } = req.body;

    // Find pool data
    const radarResults = getLatestRadarResults();
    const fromRadar = radarResults.find(r =>
      r.pool.chain === chain &&
      (r.pool.poolAddress === address || r.pool.externalId === address)
    );
    const memPool = memoryStore.getAllPools().find(p =>
      p.chain === chain && (p.poolAddress === address || p.id === address)
    );

    const price = fromRadar?.pool.price || memPool?.price || 1;
    const tvl = fromRadar?.pool.tvl || memPool?.tvlUSD || 0;
    const fees24h = fromRadar?.pool.fees24h || memPool?.fees24hUSD || 0;
    const vol = memPool?.volatilityAnn || 0.3;

    // Calculate range for selected mode
    const range = calcRangeRecommendation({
      price, volAnn: vol, horizonDays, riskMode: mode, poolType: memPool?.poolType,
    });

    const result = calcMonteCarlo({
      currentPrice: price,
      rangeLower: range.lower,
      rangeUpper: range.upper,
      capital,
      volAnn: vol,
      fees24h,
      tvl,
      horizonDays,
      scenarios: Math.min(scenarios, 5000),
      mode,
    });

    res.json({
      success: true,
      data: {
        ...result,
        pool: {
          price, tvl, fees24h, volatility: vol,
          rangeLower: range.lower, rangeUpper: range.upper,
        },
      },
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'POST /monte-carlo failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// POST /api/backtest — backtest a range strategy
router.post('/backtest', validate(backtestSchema), async (req, res) => {
  try {
    const { chain, address, capital = 10000, periodDays = 30, mode = 'NORMAL' } = req.body;

    const radarResults = getLatestRadarResults();
    const fromRadar = radarResults.find(r =>
      r.pool.chain === chain &&
      (r.pool.poolAddress === address || r.pool.externalId === address)
    );
    const memPool = memoryStore.getAllPools().find(p =>
      p.chain === chain && (p.poolAddress === address || p.id === address)
    );

    const price = fromRadar?.pool.price || memPool?.price || 1;
    const tvl = fromRadar?.pool.tvl || memPool?.tvlUSD || 0;
    const fees24h = fromRadar?.pool.fees24h || memPool?.fees24hUSD || 0;
    const vol = memPool?.volatilityAnn || 0.3;

    const range = calcRangeRecommendation({
      price, volAnn: vol, horizonDays: periodDays, riskMode: mode, poolType: memPool?.poolType,
    });

    // Fetch real OHLCV for backtest when available
    let priceHistory: number[] | undefined;
    try {
      const { geckoTerminalAdapter } = await import('../adapters/index.js');
      const history = await geckoTerminalAdapter.getPoolHistory(chain, address, Math.min(periodDays, 90));
      if (history.length >= 7) {
        priceHistory = history
          .filter(h => h.price != null && h.price > 0)
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
          .map(h => h.price!);
      }
    } catch { /* fall back to GBM simulation */ }

    const result = calcBacktest({
      capital,
      entryPrice: price,
      rangeLower: range.lower,
      rangeUpper: range.upper,
      volAnn: vol,
      fees24h,
      tvl,
      mode,
      periodDays: Math.min(periodDays, 365),
      priceHistory,
    });

    res.json({
      success: true,
      data: {
        ...result,
        dataSource: priceHistory ? 'historical_ohlcv' : 'gbm_simulation',
        historicalDays: priceHistory?.length ?? 0,
        pool: { price, tvl, fees24h, volatility: vol, rangeLower: range.lower, rangeUpper: range.upper },
      },
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'POST /backtest failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// POST /api/lvr — Loss-Versus-Rebalancing analysis
router.post('/lvr', validate(lvrSchema), async (req, res) => {
  try {
    const { chain, address, capital = 10000, mode = 'NORMAL' } = req.body;

    const radarResults = getLatestRadarResults();
    const fromRadar = radarResults.find(r =>
      r.pool.chain === chain &&
      (r.pool.poolAddress === address || r.pool.externalId === address)
    );
    const memPool = memoryStore.getAllPools().find(p =>
      p.chain === chain && (p.poolAddress === address || p.id === address)
    );

    const tvl = fromRadar?.pool.tvl || memPool?.tvlUSD || 0;
    const fees24h = fromRadar?.pool.fees24h || memPool?.fees24hUSD || 0;
    const vol = memPool?.volatilityAnn || 0.3;

    const result = calcLVR({ capital, volAnn: vol, fees24h, tvl, mode });

    res.json({
      success: true,
      data: {
        ...result,
        pool: { tvl, fees24h, volatility: vol },
      },
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'POST /lvr failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// GET /api/fee-tiers/:chain/:token0/:token1 — compare fee tiers for same pair
router.get('/fee-tiers/:chain/:token0/:token1', async (req, res) => {
  try {
    const { chain, token0, token1 } = req.params;
    const { capital = '10000', mode = 'NORMAL' } = req.query;
    const capUSD = parseFloat(capital as string) || 10000;

    // Find all pools matching this pair across fee tiers
    const allPools = memoryStore.getAllPools();
    const matchingPools = allPools.filter(p => {
      if (p.chain !== chain) return false;
      const t0 = (p.token0?.symbol || p.baseToken || '').toUpperCase();
      const t1 = (p.token1?.symbol || p.quoteToken || '').toUpperCase();
      const searchT0 = token0.toUpperCase();
      const searchT1 = token1.toUpperCase();
      return (t0 === searchT0 && t1 === searchT1) || (t0 === searchT1 && t1 === searchT0);
    });

    if (matchingPools.length === 0) {
      return res.json({ success: true, data: [], message: 'No pools found for this pair' });
    }

    // Calculate metrics for each fee tier
    const tierComparison = matchingPools.map(p => {
      const vol = p.volatilityAnn || 0.3;
      const price = p.price || 1;
      const range = calcRangeRecommendation({
        price, volAnn: vol, horizonDays: 30, riskMode: mode as 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE',
        poolType: p.poolType,
      });
      const feeEst = calcUserFees({
        tvl: p.tvlUSD, fees24h: p.fees24hUSD, fees1h: p.volume1hUSD ? p.volume1hUSD * (p.feeTier || 0) : undefined,
        userCapital: capUSD, riskMode: mode as 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE',
      });
      const ilRisk = calcILRisk({
        price, rangeLower: range.lower, rangeUpper: range.upper, volAnn: vol, horizonDays: 30,
      });
      const lvr = calcLVR({
        capital: capUSD, volAnn: vol, fees24h: p.fees24hUSD || 0, tvl: p.tvlUSD || 0,
        mode: mode as 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE',
      });

      return {
        poolAddress: p.poolAddress,
        feeTier: p.feeTier,
        feeTierBps: Math.round((p.feeTier || 0) * 10000),
        tvl: p.tvlUSD,
        volume24h: p.volume24hUSD,
        fees24h: p.fees24hUSD,
        apr: p.aprTotal ?? p.aprFee,
        volatility: vol,
        healthScore: p.healthScore,
        feeEstimate30d: feeEst.expectedFees30d,
        ilRisk: ilRisk.probOutOfRange,
        lvr: lvr.lvrPercent,
        lvrVerdict: lvr.verdict,
        rangeWidth: range.widthPct,
        protocol: p.protocol,
      };
    });

    // Sort by estimated fees descending
    tierComparison.sort((a, b) => (b.feeEstimate30d || 0) - (a.feeEstimate30d || 0));

    res.json({
      success: true,
      data: tierComparison,
      pair: `${token0}/${token1}`,
      chain,
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'GET /fee-tiers failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// GET /api/portfolio-analytics — portfolio-level analytics (Sharpe, diversification, allocation)
router.get('/portfolio-analytics', async (req, res) => {
  try {
    const allRangePositions = rangeMonitorService.getPositions();
    const radarResults = getLatestRadarResults();
    const activePositions = allRangePositions.filter(rp => rp.isActive);

    // Try to fetch OHLCV daily returns for each position (parallel, best-effort)
    let ohlcvMap = new Map<string, number[]>(); // poolKey → daily returns %
    try {
      const { geckoTerminalAdapter } = await import('../adapters/index.js');
      const fetches = activePositions.map(async (rp) => {
        try {
          const history = await geckoTerminalAdapter.getPoolHistory(rp.chain, rp.poolAddress, 30);
          if (history && history.length >= 7) {
            // Compute daily log-returns from OHLCV close prices
            const dailyReturns: number[] = [];
            for (let i = 1; i < history.length; i++) {
              const prev = history[i - 1].price ?? history[i - 1].tvl;
              const curr = history[i].price ?? history[i].tvl;
              if (prev > 0 && curr > 0) {
                dailyReturns.push(((curr - prev) / prev) * 100);
              }
            }
            if (dailyReturns.length >= 7) {
              ohlcvMap.set(`${rp.chain}_${rp.poolAddress}`, dailyReturns);
            }
          }
        } catch { /* best-effort: skip this position */ }
      });
      await Promise.allSettled(fetches);
    } catch { /* OHLCV unavailable — will use snapshot method */ }

    const positions: PortfolioPosition[] = activePositions.map(rp => {
      const fromRadar = radarResults.find(r =>
        r.pool.chain === rp.chain &&
        (r.pool.poolAddress === rp.poolAddress || r.pool.externalId === rp.poolAddress)
      );
      const memPool = memoryStore.getAllPools().find(p =>
        p.chain === rp.chain && (p.poolAddress === rp.poolAddress || p.id === rp.poolId)
      );

      return {
        poolId: rp.poolId,
        chain: rp.chain,
        pair: `${rp.token0Symbol}/${rp.token1Symbol}`,
        capital: rp.capital,
        apr: memPool?.aprTotal ?? memPool?.aprFee ?? fromRadar?.pool.apr ?? 0,
        volAnn: memPool?.volatilityAnn ?? fromRadar?.pool.volatilityAnn ?? 0.3,
        feesAccrued: (fromRadar?.pool.fees24h || memPool?.fees24hUSD || 0) *
          (rp.capital / (fromRadar?.pool.tvl || memPool?.tvlUSD || 1)) * 0.75 *
          (Date.now() - new Date(rp.createdAt).getTime()) / 86400000,
        ilActual: 0,
        protocol: memPool?.protocol || fromRadar?.pool.protocol || '',
        token0Symbol: rp.token0Symbol,
        token1Symbol: rp.token1Symbol,
        dailyReturns: ohlcvMap.get(`${rp.chain}_${rp.poolAddress}`),
      };
    });

    const analytics = calcPortfolioAnalytics(positions);
    res.json({ success: true, data: analytics, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'GET /portfolio-analytics failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// POST /api/auto-compound — auto-compound simulation
router.post('/auto-compound', validate(autoCompoundSchema), async (req, res) => {
  try {
    const { chain, address, capital = 10000, periodDays = 365, compoundFrequency = 'weekly', gasPerCompound = 2.5 } = req.body;

    const radarResults = getLatestRadarResults();
    const fromRadar = radarResults.find(r =>
      r.pool.chain === chain &&
      (r.pool.poolAddress === address || r.pool.externalId === address)
    );
    const memPool = memoryStore.getAllPools().find(p =>
      p.chain === chain && (p.poolAddress === address || p.id === address)
    );

    const apr = memPool?.aprTotal ?? memPool?.aprFee ?? fromRadar?.pool.apr ?? 0;

    const result = calcAutoCompound({
      capital,
      apr,
      periodDays: Math.min(periodDays, 730),
      compoundFrequency,
      gasPerCompound,
    });

    res.json({
      success: true,
      data: { ...result, pool: { apr, chain, address } },
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'POST /auto-compound failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// GET /api/token-correlation/:chain/:address — token pair correlation analysis
router.get('/token-correlation/:chain/:address', async (req, res) => {
  try {
    const { chain, address } = req.params;

    const memPool = memoryStore.getAllPools().find(p =>
      p.chain === chain && (p.poolAddress === address || p.id === address)
    );

    if (!memPool) {
      return res.status(404).json({ success: false, error: 'Pool not found' });
    }

    // Try to fetch OHLCV for real Pearson correlation
    let priceHistory: { timestamp: Date; price: number }[] | undefined;
    try {
      const { geckoTerminalAdapter } = await import('../adapters/index.js');
      const history = await geckoTerminalAdapter.getPoolHistory(chain, address, 30);
      if (history.length >= 10) {
        priceHistory = history
          .filter(h => h.price != null && h.price > 0)
          .map(h => ({ timestamp: h.timestamp, price: h.price! }));
      }
    } catch { /* fall back to rule-based */ }

    const result = calcTokenCorrelation({
      token0Symbol: memPool.token0?.symbol || memPool.baseToken || 'Token0',
      token1Symbol: memPool.token1?.symbol || memPool.quoteToken || 'Token1',
      poolVolAnn: memPool.volatilityAnn || 0.3,
      poolType: memPool.poolType as 'CL' | 'V2' | 'STABLE' | undefined,
      feeTier: memPool.feeTier,
      priceHistory,
    });

    res.json({ success: true, data: result, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'GET /token-correlation failed', { error });
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

// ============================================================
// PRICE HISTORY (OHLCV) — ETAPA 15
// GET /api/pools/:chain/:address/ohlcv
// Params: timeframe (day|hour|minute), limit, token (base|quote)
// ============================================================
router.get('/pools/:chain/:address/ohlcv', async (req, res) => {
  try {
    const { chain, address } = req.params;
    if (!chain || !address) {
      return res.status(400).json({ success: false, error: 'chain and address are required', timestamp: new Date() });
    }

    const timeframe = (req.query.timeframe as string) || 'hour';
    if (!['day', 'hour', 'minute'].includes(timeframe)) {
      return res.status(400).json({ success: false, error: 'timeframe must be day, hour or minute', timestamp: new Date() });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 168, 1000);
    const token = (req.query.token as string) === 'quote' ? 'quote' : 'base';

    const result = await priceHistoryService.getOhlcv(
      chain,
      address,
      timeframe as 'day' | 'hour' | 'minute',
      limit,
      token
    );

    if (!result) {
      return res.status(404).json({ success: false, error: 'Price history not available for this pool', timestamp: new Date() });
    }

    res.json({ success: true, data: result, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'GET /pools/ohlcv failed', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch price history', timestamp: new Date() });
  }
});

export default router;
