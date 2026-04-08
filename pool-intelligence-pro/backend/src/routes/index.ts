import { Router } from 'express';
import { getAllProvidersHealth } from '../adapters/index.js';
import { cacheService } from '../services/cache.service.js';
import { alertService } from '../services/alert.service.js';
import { metricsService } from '../services/metrics.service.js';
import { logService } from '../services/log.service.js';
import { getMemoryStoreStats } from '../jobs/index.js';
import { telegramBot } from '../bot/telegram.js';

import poolsRouter from './pools.routes.js';
import settingsRouter from './settings.routes.js';
import alertsRouter from './alerts.routes.js';
import rangesRouter from './ranges.routes.js';
import dataRouter from './data.routes.js';
import docsRouter from './docs.routes.js';
import historyRouter from './history.routes.js';
import integrationsRouter from './integrations.routes.js';
import aiInsightsRouter from './ai-insights.routes.js';
import pushRouter from './push.routes.js';
import walletRouter from './wallet.routes.js';
import calcRouter from './calc.routes.js';
import lpPositionsRouter from './lp-positions.routes.js';
import benchmarksRouter from './benchmarks.routes.js';
import { macroCalendarService } from '../services/macro-calendar.service.js';
import { marketRegimeService } from '../services/market-regime.service.js';
import { memoryStore } from '../services/memory-store.service.js';
import type { Pool } from '../types/index.js';
import { decisionLogService } from '../services/decision-log.service.js';
import { weightOptimizerService } from '../services/weight-optimizer.service.js';

const router = Router();

// Health check — comprehensive system status
router.get('/health', async (req, res) => {
  const providers = await getAllProvidersHealth();

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

  const metrics = metricsService.getSnapshot();

  res.json({
    status,
    uptime: metrics.uptime,
    memory: metrics.memory,
    providers,
    cache: cacheService.getStats(),
    memoryStore: getMemoryStoreStats(),
    alerts: alertService.getStats(),
    requests: metrics.requests,
    jobs: metrics.jobs,
    logs: logService.getSummary(60),
    timestamp: new Date(),
  });
});

// Mount sub-routers
router.use(poolsRouter);
router.use(settingsRouter);
router.use(alertsRouter);
router.use(rangesRouter);
router.use(dataRouter);
router.use(docsRouter);
router.use(historyRouter);
router.use(integrationsRouter);
router.use(aiInsightsRouter);
router.use(pushRouter);
router.use(walletRouter);
router.use('/calc', calcRouter);
router.use(lpPositionsRouter);
router.use(benchmarksRouter);

// ============================================
// MACRO CALENDAR ROUTES
// ============================================

// GET /api/macro — Get macro context (risk level + upcoming events)
router.get('/macro', (req, res) => {
  try {
    const context = macroCalendarService.getMacroContext();
    res.json({ success: true, data: context, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'GET /macro failed', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch macro context', timestamp: new Date() });
  }
});

// GET /api/macro/events — List upcoming events
router.get('/macro/events', (req, res) => {
  try {
    const daysParsed = parseInt(req.query.days as string, 10);
    const days = (!Number.isNaN(daysParsed) && daysParsed > 0) ? daysParsed : 7;
    const events = macroCalendarService.getUpcomingEvents(Math.min(days, 90));
    res.json({ success: true, data: events, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'GET /macro/events failed', { error });
    res.status(500).json({ success: false, error: 'Failed to fetch macro events', timestamp: new Date() });
  }
});

// POST /api/macro/events — Add custom macro event
router.post('/macro/events', (req, res) => {
  try {
    const { name, date, type, impact, description, source, liquidityEffect } = req.body;
    const validTypes = ['ECONOMIC', 'RATE_DECISION', 'CRYPTO_EVENT', 'VOLATILITY', 'EARNINGS', 'REGULATORY'];
    if (!name || !date || !type) {
      return res.status(400).json({ success: false, error: 'name, date, and type are required', timestamp: new Date() });
    }
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, error: `type must be one of: ${validTypes.join(', ')}`, timestamp: new Date() });
    }
    if (isNaN(new Date(date).getTime())) {
      return res.status(400).json({ success: false, error: 'date must be a valid ISO date string', timestamp: new Date() });
    }
    const event = macroCalendarService.addEvent({
      name,
      date: new Date(date),
      type: type,
      impact: impact || 'MEDIUM',
      description: description || '',
      source: source || 'user',
      liquidityEffect: liquidityEffect ?? -10,
    });
    res.json({ success: true, data: event, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'POST /macro/events failed', { error });
    res.status(500).json({ success: false, error: 'Failed to add macro event', timestamp: new Date() });
  }
});

// DELETE /api/macro/events/:id — Remove custom macro event
router.delete('/macro/events/:id', (req, res) => {
  try {
    const deleted = macroCalendarService.removeEvent(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Event not found', timestamp: new Date() });
    }
    res.json({ success: true, message: 'Event removed', timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'DELETE /macro/events failed', { error });
    res.status(500).json({ success: false, error: 'Failed to remove event', timestamp: new Date() });
  }
});

// ============================================
// MARKET REGIME ROUTES
// ============================================

// GET /api/market-conditions — condições globais de mercado para LP
router.get('/market-conditions', (_req, res) => {
  try {
    const unifiedPools = memoryStore.getAllPools();
    // UnifiedPool é estruturalmente compatível com Pool nos campos usados pelo MarketRegimeService
    const conditions = marketRegimeService.getGlobalConditions(unifiedPools as unknown as Pool[]);
    res.json({ success: true, data: conditions, timestamp: new Date() });
  } catch (error) {
    logService.error('SYSTEM', 'GET /market-conditions failed', { error });
    res.status(500).json({ success: false, error: 'Failed to get market conditions', timestamp: new Date() });
  }
});

// ============================================
// WEB VITALS METRICS ENDPOINT
// ============================================

// ============================================
// TELEGRAM WEBHOOK ENDPOINT
// ============================================

// POST /api/telegram/webhook — recebe updates do Telegram (via webhook mode)
router.post('/telegram/webhook', async (req, res) => {
  try {
    await telegramBot.processWebhookUpdate(req.body as Record<string, unknown>);
    res.json({ ok: true });
  } catch (error) {
    logService.error('SYSTEM', 'Telegram webhook endpoint error', { error });
    res.status(500).json({ ok: false });
  }
});

// ============================================
// WEB VITALS METRICS ENDPOINT
// ============================================

// ============================================
// DECISION LOG (Fase 6 — 6.3)
// ============================================

// GET /api/decision-log — retorna histórico de decisões
router.get('/decision-log', (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '50')), 200);
  const type = req.query.type as string | undefined;
  const entries = decisionLogService.getEntries(limit, type as Parameters<typeof decisionLogService.getEntries>[1]);
  const stats = decisionLogService.getStats();
  res.json({ success: true, data: { entries, stats }, timestamp: new Date() });
});

// POST /api/decision-log — adiciona entrada manual
router.post('/decision-log', (req, res) => {
  const { summary, data, poolId, poolName } = req.body as {
    summary?: string;
    data?: Record<string, unknown>;
    poolId?: string;
    poolName?: string;
  };
  if (!summary) {
    res.status(400).json({ success: false, error: 'summary is required' });
    return;
  }
  const entry = decisionLogService.addEntry({
    type: 'MANUAL',
    summary,
    data: data ?? {},
    poolId,
    poolName,
  });
  res.json({ success: true, data: entry, timestamp: new Date() });
});

// ============================================
// SCORE WEIGHTS (Fase 6 — 6.4)
// ============================================

// GET /api/score-weights — pesos atuais
router.get('/score-weights', (_req, res) => {
  const weights = weightOptimizerService.getCurrentWeights();
  const lastAdjustedAt = weightOptimizerService.getLastAdjustedAt();
  res.json({ success: true, data: { weights, lastAdjustedAt }, timestamp: new Date() });
});

// POST /api/score-weights/auto-adjust — ajuste baseado no regime atual
router.post('/score-weights/auto-adjust', (_req, res) => {
  const result = weightOptimizerService.autoAdjust();
  res.json({ success: true, data: result, timestamp: new Date() });
});

// POST /api/score-weights/reset — volta para defaults
router.post('/score-weights/reset', (_req, res) => {
  const weights = weightOptimizerService.resetToDefaults();
  res.json({ success: true, data: { weights }, timestamp: new Date() });
});

// POST /api/metrics/vitals — Receive Web Vitals from frontend
router.post('/metrics/vitals', (req, res) => {
  try {
    const { name, value, rating } = req.body;
    if (name && typeof value === 'number') {
      logService.info('METRICS', `Web Vital: ${name}=${value.toFixed(2)} (${rating || 'unknown'})`, {
        component: 'WEB_VITALS',
        vital: name,
        value,
        rating,
      });
    }
    res.status(204).end();
  } catch {
    res.status(204).end(); // Never fail — monitoring should be transparent
  }
});

export default router;
