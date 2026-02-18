import { Router } from 'express';
import { getPoolsWithFallback, getPoolWithFallback, getAllProvidersHealth } from '../adapters/index.js';
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

// Get pools (radar results)
router.get('/pools', async (req, res) => {
  try {
    const { chain } = req.query;
    let results = getLatestRadarResults();
    
    if (chain) {
      results = results.filter(r => r.pool.chain === chain);
    }
    
    res.json({
      success: true,
      data: results,
      count: results.length,
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

export default router;
