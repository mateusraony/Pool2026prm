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
  removeFromWatchlist,
  getMemoryStoreStats
} from '../jobs/index.js';
import { memoryStore } from '../services/memory-store.service.js';
import { config } from '../config/index.js';
import { poolIntelligenceService } from '../services/pool-intelligence.service.js';
import { calcRangeRecommendation, calcUserFees, calcILRisk } from '../services/calc.service.js';
import { Pool, UnifiedPool } from '../types/index.js';
import {
  validate,
  watchlistSchema, alertSchema, rangePositionSchema, rangeCalcSchema,
  favoriteSchema, noteSchema, telegramTestRecsSchema, notificationSettingsSchema,
} from './validation.js';

// Lazy PrismaClient: only connects when first DB query happens.
// Prevents server crash if DATABASE_URL is missing or DB is unreachable.
let _prisma: PrismaClient | null = null;
function getPrisma(): PrismaClient {
  if (!_prisma) {
    _prisma = new PrismaClient();
  }
  return _prisma;
}

const router = Router();

// Health check
router.get('/health', async (req, res) => {
  const providers = await getAllProvidersHealth();

  // Somente providers obrigatórios (isOptional=false) afetam o status geral
  const mandatory = providers.filter(p => !p.isOptional);
  const healthyMandatory = mandatory.filter(p => p.isHealthy).length;

  let status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  if (healthyMandatory === mandatory.length && mandatory.length > 0) {
    status = 'HEALTHY';
  } else if (healthyMandatory > 0) {
    status = 'DEGRADED';
  } else {
    status = 'UNHEALTHY';
  }

  res.json({
    status,
    providers,
    cache: cacheService.getStats(),
    memoryStore: getMemoryStoreStats(),
    alerts: alertService.getStats(),
    timestamp: new Date(),
  });
});

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
          // Persiste no MemoryStore para os próximos requests
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

      // Salva no MemoryStore para os próximos requests não precisarem recalcular
      if (pools.length > 0) memoryStore.setPools(pools);
    }

    // ── 3. Filtros e ordenação (mesmo dado, sem re-enriquecer) ──
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

    // Check MemoryStore (may have pools loaded from /pools endpoint)
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
        volatilityAnn: memUnified.volatilityAnn, // For live IL/range calculations
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

    // If not in radar or memory, try external providers
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

// Get recommendations — lê do MemoryStore (fresco) ou fallback para state legado
router.get('/recommendations', async (req, res) => {
  try {
    const { mode, limit, tokens, useTokenFilter } = req.query;
    // Prefere MemoryStore (atualizado pelo recommendationJobRunner)
    let recommendations = memoryStore.getRecommendations() ?? getLatestRecommendations();

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
router.post('/watchlist', validate(watchlistSchema), async (req, res) => {
  try {
    const { poolId, chain, address } = req.body;
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
router.put('/settings/notifications', validate(notificationSettingsSchema), async (req, res) => {
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
router.post('/settings/telegram/test-recommendations', validate(telegramTestRecsSchema), async (req, res) => {
  try {
    const { limit, useTokenFilter } = req.body;
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
router.post('/alerts', validate(alertSchema), async (req, res) => {
  try {
    const { poolId, type, threshold } = req.body;
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
router.post('/ranges', validate(rangePositionSchema), async (req, res) => {
  try {
    const {
      poolId, chain, poolAddress, token0Symbol, token1Symbol,
      rangeLower, rangeUpper, entryPrice, capital, mode, alertThreshold,
    } = req.body;

    const position = rangeMonitorService.createPosition({
      poolId,
      chain,
      poolAddress: poolAddress || poolId,
      token0Symbol,
      token1Symbol,
      rangeLower,
      rangeUpper,
      entryPrice: entryPrice || (rangeLower + rangeUpper) / 2,
      capital,
      mode,
      alertThreshold,
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

// ============================================
// FAVORITES
// ============================================

router.get('/favorites', async (req, res) => {
  try {
    const favorites = await getPrisma().favorite.findMany({ orderBy: { addedAt: 'desc' } });
    res.json({ success: true, data: favorites });
  } catch (error) {
    // DB might not be configured or table doesn't exist — return empty array gracefully
    logService.warn('SYSTEM', 'GET /favorites - DB unavailable, returning empty', { error });
    res.json({ success: true, data: [], note: 'Database não configurada ou tabela não existe' });
  }
});

router.post('/favorites', validate(favoriteSchema), async (req, res) => {
  try {
    const { poolId, chain, poolAddress, token0Symbol, token1Symbol, protocol } = req.body;
    const fav = await getPrisma().favorite.upsert({
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
    await getPrisma().favorite.deleteMany({ where: { poolId } });
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
    const notes = await getPrisma().note.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: notes });
  } catch (error) {
    logService.error('SYSTEM', 'GET /notes failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

router.post('/notes', validate(noteSchema), async (req, res) => {
  try {
    const { poolId, text, tags } = req.body;
    const note = await getPrisma().note.create({ data: { poolId, text, tags } });
    res.json({ success: true, data: note });
  } catch (error) {
    logService.error('SYSTEM', 'POST /notes failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

router.delete('/notes/:id', async (req, res) => {
  try {
    await getPrisma().note.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /notes/:id failed', { error });
    res.status(500).json({ success: false, error: 'Internal error' });
  }
});

export default router;
