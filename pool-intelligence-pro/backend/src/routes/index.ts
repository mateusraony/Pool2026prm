import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { getPoolsWithFallback, getPoolWithFallback, getAllProvidersHealth, theGraphAdapter } from '../adapters/index.js';
import { scoreService } from '../services/score.service.js';
import { cacheService } from '../services/cache.service.js';
import { logService } from '../services/log.service.js';
import { alertService } from '../services/alert.service.js';
import { rangeMonitorService } from '../services/range.service.js';
import { notificationSettingsService } from '../services/notification-settings.service.js';
import { telegramBot } from '../bot/telegram.js';
import {
  getLatestRadarResults,
  getLatestRecommendations,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist
} from '../jobs/index.js';
import { config } from '../config/index.js';
import { poolIntelligenceService } from '../services/pool-intelligence.service.js';
import { calcRangeRecommendation, calcUserFees, calcILRisk } from '../services/calc.service.js';
import { Pool, UnifiedPool } from '../types/index.js';

const prisma = new PrismaClient();

const router = Router();

// Health check
router.get('/health', async (req, res) => {
  const providers = await getAllProvidersHealth();
  const healthy = providers.filter(p => p.isHealthy).length;
  
  res.json({
    status: healthy === providers.length ? 'HEALTHY' : healthy > 0 ? 'DEGRADED' : 'UNHEALTHY',
    providers,
    cache: cacheService.getStats(),
    alerts: alertService.getStats(),
    timestamp: new Date(),
  });
});

// Get pools (radar results) — enhanced with UnifiedPool format + full filtering/sorting
router.get('/pools', async (req, res) => {
  try {
    const {
      chain, protocol, token, bluechip, poolType,
      sortBy = 'tvl', sortDirection = 'desc',
      page, limit: limitStr,
      minTVL, minHealth,
    } = req.query;

    let radarResults = getLatestRadarResults();

    // Also pull TheGraph data if available (supplement radar)
    const theGraphKey = `thegraph_unified_${chain || 'all'}`;
    let theGraphUnified = cacheService.get<UnifiedPool[]>(theGraphKey).data;
    if (!theGraphUnified && !cacheService.get(`thegraph_fetching_${chain || 'all'}`).data) {
      // Kick off background fetch (non-blocking)
      cacheService.set(`thegraph_fetching_${chain || 'all'}`, true, 60);
      const chainsToFetch = chain ? [chain as string] : ['ethereum', 'arbitrum', 'base'];
      Promise.all(chainsToFetch.map(c => theGraphAdapter.getPools(c, 50))).then(results => {
        const allPools = results.flat();
        const unified = allPools.map(p => poolIntelligenceService.enrichToUnifiedPool(p, { updatedAt: new Date() }));
        cacheService.set(theGraphKey, unified, 300);
      }).catch(() => {});
    }

    // Build unified pool list from radar results
    const radarUnified: UnifiedPool[] = radarResults.map(r =>
      poolIntelligenceService.enrichToUnifiedPool(r.pool, { updatedAt: new Date() })
    );

    // Merge: prefer TheGraph data (has volume1h), fall back to radar
    const tgUnified = theGraphUnified ?? [];
    const mergedMap = new Map<string, UnifiedPool>();
    for (const p of radarUnified) mergedMap.set(p.id, p);
    for (const p of tgUnified) {
      // TheGraph has better data if volume1h is available
      if (!mergedMap.has(p.id) || p.volume1hUSD != null) {
        mergedMap.set(p.id, p);
      }
    }
    let pools = Array.from(mergedMap.values());

    // Apply filters
    pools = poolIntelligenceService.applyPoolFilters(pools, {
      chain: chain as string | undefined,
      protocol: protocol as string | undefined,
      token: token as string | undefined,
      bluechip: bluechip === 'true' ? true : undefined,
      minTVL: minTVL ? parseFloat(minTVL as string) : undefined,
      minHealth: minHealth ? parseFloat(minHealth as string) : undefined,
      poolType: poolType as string | undefined,
    });

    // Apply sorting
    const validSortKeys = ['tvl', 'apr', 'aprFee', 'aprAdjusted', 'volume1h', 'volume5m', 'fees1h', 'fees5m', 'healthScore', 'volatilityAnn', 'ratio'] as const;
    type SortKey = typeof validSortKeys[number];
    const sortKey = (validSortKeys.includes(sortBy as SortKey) ? sortBy : 'tvl') as SortKey;
    pools = poolIntelligenceService.sortPools(pools, sortKey, (sortDirection as string) === 'asc' ? 'asc' : 'desc');

    // Pagination
    const total = pools.length;
    const lim = limitStr ? Math.min(parseInt(limitStr as string), 200) : 50;
    const pg = page ? parseInt(page as string) : null;
    if (pg != null) {
      const offset = (pg - 1) * lim;
      pools = pools.slice(offset, offset + lim);
    } else {
      pools = pools.slice(0, lim);
    }

    res.json({
      pools,
      total,
      page: pg,
      limit: lim,
      syncing: !!cacheService.get(`thegraph_fetching_${chain || 'all'}`),
      tokenFilters: notificationSettingsService.getTokenFilters(),
      timestamp: new Date(),
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

    // First check if we have this pool in radar results (most common case)
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

    // If not in radar, try external providers
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
    let recommendations = getLatestRecommendations();

    // Apply token filter from settings if useTokenFilter=true or if no tokens query param
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

    // Filter by mode if specified
    if (mode && typeof mode === 'string') {
      recommendations = recommendations.filter(r => r.mode === mode.toUpperCase());
    }

    // Limit results
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

// Get watchlist
router.get('/watchlist', async (req, res) => {
  try {
    const watchlist = getWatchlist();
    
    res.json({
      success: true,
      data: watchlist,
      count: watchlist.length,
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'GET /watchlist failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Add to watchlist
router.post('/watchlist', async (req, res) => {
  try {
    const { poolId, chain, address } = req.body;
    
    if (!poolId || !chain || !address) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }
    
    addToWatchlist({ poolId, chain, address });
    
    res.json({
      success: true,
      message: 'Added to watchlist',
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'POST /watchlist failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Remove from watchlist
router.delete('/watchlist/:poolId', async (req, res) => {
  try {
    const { poolId } = req.params;
    removeFromWatchlist(poolId);
    
    res.json({
      success: true,
      message: 'Removed from watchlist',
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /watchlist/:poolId failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Get system logs
router.get('/logs', async (req, res) => {
  const { level, component, limit } = req.query;
  
  const logs = logService.getRecentLogs(
    parseInt(limit as string) || 100,
    level as any,
    component as any
  );
  
  res.json({
    success: true,
    data: logs,
    count: logs.length,
    timestamp: new Date(),
  });
});

// Get settings (system + notification)
router.get('/settings', async (req, res) => {
  res.json({
    success: true,
    data: {
      system: {
        mode: config.defaults.mode,
        capital: config.defaults.capital,
        chains: config.defaults.chains,
        thresholds: config.thresholds,
        scoreWeights: config.scoreWeights,
      },
      notifications: notificationSettingsService.getSettings(),
      telegram: {
        enabled: telegramBot.isEnabled(),
        chatId: config.telegram.chatId ? '***' + config.telegram.chatId.slice(-4) : null,
      },
    },
    timestamp: new Date(),
  });
});

// Update notification settings
router.put('/settings/notifications', async (req, res) => {
  try {
    const updated = notificationSettingsService.updateSettings(req.body);
    res.json({
      success: true,
      data: updated,
      message: 'Notification settings updated',
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'PUT /settings/notifications failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Send test Telegram message (simple connection test)
router.post('/settings/telegram/test', async (req, res) => {
  try {
    const appUrl = notificationSettingsService.getAppUrl();
    const posLink = notificationSettingsService.getPositionsLink();
    const msg =
      `✅ <b>Teste de Notificação</b>\n\n` +
      `Pool Intelligence Pro está funcionando!\n` +
      `URL do App: ${appUrl}\n\n` +
      `🔗 <a href="${posLink}">Abrir Posições</a>`;
    const sent = await telegramBot.sendMessage(msg);
    if (sent) {
      res.json({ success: true, message: 'Test message sent' });
    } else {
      res.status(400).json({ success: false, error: 'Telegram not configured or failed to send' });
    }
  } catch (error) {
    logService.error('SYSTEM', 'POST /settings/telegram/test failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Send top recommendations via Telegram (real data test)
router.post('/settings/telegram/test-recommendations', async (req, res) => {
  try {
    const { limit = 5, useTokenFilter = true } = req.body;
    let recommendations = getLatestRecommendations();

    if (recommendations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Nenhuma recomendação disponível. Aguarde o sistema coletar dados das pools.',
      });
    }

    // Apply token filter from settings
    if (useTokenFilter && notificationSettingsService.hasTokenFilter()) {
      recommendations = recommendations.filter(r =>
        notificationSettingsService.matchesTokenFilter(r.pool.token0.symbol, r.pool.token1.symbol)
      );
    }

    if (recommendations.length === 0) {
      const tokens = notificationSettingsService.getTokenFilters();
      return res.status(400).json({
        success: false,
        error: `Nenhuma pool encontrada com os tokens filtrados: ${tokens.join(', ')}. Adicione mais tokens ou remova o filtro.`,
        tokenFilters: tokens,
      });
    }

    // Limit
    const top = recommendations.slice(0, Math.min(limit, 10));
    const tokenFilters = notificationSettingsService.getTokenFilters();
    const filterText = tokenFilters.length > 0 ? `Filtros: ${tokenFilters.join(', ')}` : 'Sem filtros de token';

    // Build message
    let msg = `🏆 <b>TOP ${top.length} RECOMENDAÇÕES DE POOLS</b>\n`;
    msg += `📅 ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}\n`;
    msg += `🔍 ${filterText}\n\n`;

    for (const rec of top) {
      const pool = rec.pool;
      const score = rec.score;
      const poolName = `${pool.token0.symbol}/${pool.token1.symbol}`;
      const modeEmoji = rec.mode === 'DEFENSIVE' ? '🛡️' : rec.mode === 'AGGRESSIVE' ? '🔥' : '⚖️';
      const scoreEmoji = score.total >= 70 ? '🟢' : score.total >= 50 ? '🟡' : '🔴';
      const simLink = notificationSettingsService.getSimulationLink(pool.chain, pool.poolAddress);

      msg += `${scoreEmoji} <b>#${rec.rank} ${poolName}</b> ${modeEmoji}\n`;
      msg += `   📊 Score: <code>${score.total.toFixed(0)}/100</code> | ${pool.protocol} (${pool.chain})\n`;
      msg += `   💰 TVL: $${(pool.tvl / 1e6).toFixed(2)}M | Vol: $${(pool.volume24h / 1e3).toFixed(0)}K\n`;
      msg += `   📈 APR Est: <code>${rec.estimatedGainPercent.toFixed(2)}%/semana</code> (${rec.probability}% prob)\n`;
      msg += `   🔗 <a href="${simLink}">Simular</a>\n\n`;
    }

    msg += `──────────────────\n`;
    msg += `💡 <i>Clique em "Simular" para ver detalhes e adicionar ao monitoramento</i>\n`;
    msg += `<a href="${notificationSettingsService.getAppUrl()}">Abrir Pool Intelligence Pro →</a>`;

    const sent = await telegramBot.sendMessage(msg);
    if (sent) {
      res.json({
        success: true,
        message: `Enviado TOP ${top.length} recomendações para o Telegram`,
        count: top.length,
        tokenFilters,
      });
    } else {
      res.status(400).json({ success: false, error: 'Telegram não configurado ou falhou ao enviar' });
    }
  } catch (error) {
    logService.error('SYSTEM', 'POST /settings/telegram/test-recommendations failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Trigger portfolio report manually
router.post('/ranges/report', async (req, res) => {
  try {
    await rangeMonitorService.sendPortfolioReport();
    res.json({
      success: true,
      message: 'Portfolio report sent via Telegram',
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'POST /ranges/report failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Get all alert rules
router.get('/alerts', async (req, res) => {
  try {
    const rules = alertService.getRules();
    const recent = alertService.getRecentAlerts();

    res.json({
      success: true,
      data: {
        rules,
        recentAlerts: recent.slice(0, 20),
      },
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'GET /alerts failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Create alert rule
router.post('/alerts', async (req, res) => {
  try {
    const { poolId, type, threshold } = req.body;

    if (!type || threshold === undefined) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const id = Date.now().toString();
    alertService.addRule(id, {
      type,
      poolId,
      value: threshold,
    });

    res.json({
      success: true,
      data: { id },
      message: 'Alert rule created',
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'POST /alerts failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Delete alert rule
router.delete('/alerts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    alertService.removeRule(id);

    res.json({
      success: true,
      message: 'Alert rule deleted',
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /alerts/:id failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ============================================
// RANGE MONITORING ROUTES
// ============================================

// Get all range positions
router.get('/ranges', async (req, res) => {
  try {
    const positions = rangeMonitorService.getPositions();
    const stats = rangeMonitorService.getStats();

    res.json({
      success: true,
      data: positions,
      stats,
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'GET /ranges failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Create range position to monitor
router.post('/ranges', async (req, res) => {
  try {
    const {
      poolId,
      chain,
      poolAddress,
      token0Symbol,
      token1Symbol,
      rangeLower,
      rangeUpper,
      entryPrice,
      capital,
      mode,
      alertThreshold,
    } = req.body;

    if (!poolId || !rangeLower || !rangeUpper) {
      return res.status(400).json({ success: false, error: 'Missing required fields: poolId, rangeLower, rangeUpper' });
    }

    const position = rangeMonitorService.createPosition({
      poolId,
      chain: chain || 'ethereum',
      poolAddress: poolAddress || poolId,
      token0Symbol: token0Symbol || 'TOKEN0',
      token1Symbol: token1Symbol || 'TOKEN1',
      rangeLower: Number(rangeLower),
      rangeUpper: Number(rangeUpper),
      entryPrice: Number(entryPrice) || (Number(rangeLower) + Number(rangeUpper)) / 2,
      capital: Number(capital) || 1000,
      mode: mode || 'NORMAL',
      alertThreshold: Number(alertThreshold) || 5, // Default 5% from edge
    });

    res.json({
      success: true,
      data: position,
      message: 'Range monitoring started! You will be notified when price approaches the edges.',
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'POST /ranges failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Delete range position
router.delete('/ranges/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = rangeMonitorService.deletePosition(id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }

    res.json({
      success: true,
      message: 'Range monitoring stopped',
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /ranges/:id failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// Manually trigger range check (for testing)
router.post('/ranges/check', async (req, res) => {
  try {
    await rangeMonitorService.checkAllPositions();

    res.json({
      success: true,
      message: 'Range check completed',
      stats: rangeMonitorService.getStats(),
      timestamp: new Date(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'POST /ranges/check failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ============================================
// POOL INTELLIGENCE — NEW ENDPOINTS
// ============================================

// GET /api/tokens — token list for autocomplete
router.get('/tokens', async (req, res) => {
  try {
    const tokens = poolIntelligenceService.getTokenList();
    // Also pull from DB if available
    try {
      const dbTokens = await prisma.token.findMany({ select: { symbol: true }, distinct: ['symbol'], take: 500 });
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

// GET /api/pools/:chain/:address — enhanced with history and range data
// (This replaces the existing single pool endpoint with richer data)
router.get('/pools-detail/:chain/:address', async (req, res) => {
  try {
    const { chain, address } = req.params;
    const { horizonDays = '7', riskMode = 'NORMAL', capital = '1000' } = req.query;

    // Try TheGraph first for richest data
    let pool = await theGraphAdapter.getPool(chain, address);
    let history = pool ? await theGraphAdapter.getPoolHistory(chain, address, 7) : [];
    let provider = 'thegraph';

    // Fallback to existing providers
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

    // Range recommendations for all 3 modes
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

    // Fee estimates
    const feeEstimates = {
      DEFENSIVE: calcUserFees({ tvl: pool.tvl, fees24h: pool.fees24h, fees1h: (pool as Pool & { fees1h?: number }).fees1h, userCapital: capUSD, riskMode: 'DEFENSIVE' }),
      NORMAL: calcUserFees({ tvl: pool.tvl, fees24h: pool.fees24h, fees1h: (pool as Pool & { fees1h?: number }).fees1h, userCapital: capUSD, riskMode: 'NORMAL' }),
      AGGRESSIVE: calcUserFees({ tvl: pool.tvl, fees24h: pool.fees24h, fees1h: (pool as Pool & { fees1h?: number }).fees1h, userCapital: capUSD, riskMode: 'AGGRESSIVE' }),
    };

    // IL risk for selected range
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
        history: history.slice(0, 168), // max 7 days hourly
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
router.post('/range-calc', async (req, res) => {
  try {
    const { price, volAnn = 0.20, horizonDays = 7, riskMode = 'NORMAL', tickSpacing, poolType = 'CL', capital = 1000, tvl = 1000000, fees24h } = req.body;

    if (!price || price <= 0) {
      return res.status(400).json({ success: false, error: 'price is required and must be > 0' });
    }

    const ranges = {
      DEFENSIVE: calcRangeRecommendation({ price, volAnn, horizonDays, riskMode: 'DEFENSIVE', tickSpacing, poolType }),
      NORMAL: calcRangeRecommendation({ price, volAnn, horizonDays, riskMode: 'NORMAL', tickSpacing, poolType }),
      AGGRESSIVE: calcRangeRecommendation({ price, volAnn, horizonDays, riskMode: 'AGGRESSIVE', tickSpacing, poolType }),
    };

    const selected = ranges[(riskMode as string).toUpperCase() as 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE'] || ranges.NORMAL;

    const feeEstimate = calcUserFees({ tvl, fees24h, userCapital: capital, riskMode: riskMode as 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE' });
    const ilRisk = calcILRisk({ price, rangeLower: selected.lower, rangeUpper: selected.upper, volAnn, horizonDays });

    res.json({ success: true, data: { ranges, selected, feeEstimate, ilRisk } });
  } catch (error) {
    logService.error('SYSTEM', 'POST /range-calc failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ============================================
// FAVORITES
// ============================================

router.get('/favorites', async (req, res) => {
  try {
    const favorites = await prisma.favorite.findMany({ orderBy: { addedAt: 'desc' } });
    res.json({ success: true, data: favorites });
  } catch (error) {
    logService.error('SYSTEM', 'GET /favorites failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

router.post('/favorites', async (req, res) => {
  try {
    const { poolId, chain, poolAddress, token0Symbol = '', token1Symbol = '', protocol = '' } = req.body;
    if (!poolId || !chain || !poolAddress) {
      return res.status(400).json({ success: false, error: 'poolId, chain, poolAddress are required' });
    }
    const fav = await prisma.favorite.upsert({
      where: { poolId },
      create: { poolId, chain, poolAddress, token0Symbol, token1Symbol, protocol },
      update: { addedAt: new Date() },
    });
    res.json({ success: true, data: fav });
  } catch (error) {
    logService.error('SYSTEM', 'POST /favorites failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

router.delete('/favorites/:poolId', async (req, res) => {
  try {
    const { poolId } = req.params;
    await prisma.favorite.deleteMany({ where: { poolId } });
    res.json({ success: true });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /favorites failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

// ============================================
// NOTES
// ============================================

router.get('/notes', async (req, res) => {
  try {
    const { poolId } = req.query;
    const where = poolId ? { poolId: poolId as string } : {};
    const notes = await prisma.note.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: notes });
  } catch (error) {
    logService.error('SYSTEM', 'GET /notes failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

router.post('/notes', async (req, res) => {
  try {
    const { poolId, text, tags = [] } = req.body;
    if (!poolId || !text) {
      return res.status(400).json({ success: false, error: 'poolId and text are required' });
    }
    const note = await prisma.note.create({ data: { poolId, text, tags } });
    res.json({ success: true, data: note });
  } catch (error) {
    logService.error('SYSTEM', 'POST /notes failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

router.delete('/notes/:id', async (req, res) => {
  try {
    await prisma.note.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /notes/:id failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

export default router;
