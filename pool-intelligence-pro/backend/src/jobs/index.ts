import cron from 'node-cron';
import { runRadarJob } from './radar.job.js';
import { runWatchlistJob } from './watchlist.job.js';
import { recommendationService } from '../services/recommendation.service.js';
import { alertService } from '../services/alert.service.js';
import { rangeMonitorService } from '../services/range.service.js';
import { notificationSettingsService } from '../services/notification-settings.service.js';
import { telegramBot } from '../bot/telegram.js';
import { getAllProvidersHealth } from '../adapters/index.js';
import { logService } from '../services/log.service.js';
import { config } from '../config/index.js';
import { Pool, Score, Recommendation, UnifiedPool } from '../types/index.js';
import { memoryStore } from '../services/memory-store.service.js';
import { poolIntelligenceService } from '../services/pool-intelligence.service.js';
import { metricsService } from '../services/metrics.service.js';
import { wsService } from '../services/websocket.service.js';
import { eventBus } from '../services/event-bus.service.js';
import { isTimeMatch, todayStringTz } from '../services/time.service.js';
import { runDeepAnalysisJob } from './deep-analysis.job.js';
import { dbSyncService } from '../services/db-sync.service.js';
import { scoreService } from '../services/score.service.js';

// ============================================
// JOB STATE MANAGER — encapsula todo estado mutável
// ============================================
class JobStateManager {
  private radarResults: { pool: Pool; score: Score }[] = [];
  private recommendations: Recommendation[] = [];
  private watchlistItems: { poolId: string; chain: string; address: string }[] = [];

  // Spam prevention
  private lastSentRecommendationId = '';
  private lastHealthAlertTime = 0;
  private lastDailyReportDate = '';

  readonly HEALTH_ALERT_COOLDOWN = 30 * 60 * 1000; // 30 min

  // --- Radar Results ---
  getRadarResults() { return this.radarResults; }
  setRadarResults(results: { pool: Pool; score: Score }[]) { this.radarResults = results; }

  // --- Recommendations ---
  getRecommendations() { return this.recommendations; }
  setRecommendations(recs: Recommendation[]) { this.recommendations = recs; }

  // --- Watchlist ---
  getWatchlist() { return this.watchlistItems; }

  addToWatchlist(item: { poolId: string; chain: string; address: string }) {
    if (!this.watchlistItems.find(w => w.poolId === item.poolId)) {
      this.watchlistItems.push(item);
      memoryStore.addToWatchlist(item.poolId);
    }
  }

  removeFromWatchlist(poolId: string) {
    this.watchlistItems = this.watchlistItems.filter(w => w.poolId !== poolId);
    memoryStore.removeFromWatchlist(poolId);
  }

  // --- Spam Prevention ---
  getLastSentRecommendationId() { return this.lastSentRecommendationId; }
  setLastSentRecommendationId(id: string) { this.lastSentRecommendationId = id; }

  getLastHealthAlertTime() { return this.lastHealthAlertTime; }
  setLastHealthAlertTime(time: number) { this.lastHealthAlertTime = time; }

  getLastDailyReportDate() { return this.lastDailyReportDate; }
  setLastDailyReportDate(date: string) { this.lastDailyReportDate = date; }
}

// Singleton
const jobState = new JobStateManager();

// Export state accessors (backward-compatible API)
export function getLatestRadarResults() { return jobState.getRadarResults(); }
export function getLatestRecommendations() { return jobState.getRecommendations(); }
export function getWatchlist() { return jobState.getWatchlist(); }
export function addToWatchlist(item: { poolId: string; chain: string; address: string }) {
  jobState.addToWatchlist(item);
}
export function removeFromWatchlist(poolId: string) {
  jobState.removeFromWatchlist(poolId);
}

// ============================================
// JOB RUNNERS
// ============================================
async function radarJobRunner() {
  const start = Date.now();
  let success = true;
  try {
    const results = await runRadarJob();

    // Flatten and store top candidates from all chains
    jobState.setRadarResults(results.flatMap(r => r.topCandidates));
    const radarResults = jobState.getRadarResults();

    // Popula o MemoryStore com UnifiedPool já enriquecidos
    const unifiedPools = radarResults.map(r =>
      poolIntelligenceService.enrichToUnifiedPool(r.pool, { updatedAt: new Date() })
    );
    memoryStore.setPools(unifiedPools);

    // Broadcast real-time update via event bus
    await eventBus.emit('POOLS_UPDATED', { count: unifiedPools.length, pools: unifiedPools });

    // Record TVL snapshots for liquidity drop detection
    for (const p of unifiedPools) {
      memoryStore.recordTvl(p.id, p.tvlUSD);
    }

    // Persist to DB (async, fire-and-forget)
    dbSyncService.syncPools(unifiedPools).catch(err =>
      logService.warn('SYSTEM', 'DB pool sync failed', { error: String(err) })
    );

    // Sync scores to DB
    const scoreEntries = radarResults.map(r => ({
      poolId: r.pool.externalId,
      score: r.score,
    }));
    dbSyncService.syncScores(scoreEntries).catch(err =>
      logService.warn('SYSTEM', 'DB score sync failed', { error: String(err) })
    );

    // Armazena scores por pool no MemoryStore
    for (const r of radarResults) {
      memoryStore.setScore(r.pool.externalId, r.score);
    }

    logService.info('SYSTEM', 'Radar job stored ' + radarResults.length + ' candidates', {
      memoryStore: memoryStore.getStats(),
    });
  } catch (error) {
    success = false;
    logService.error('SYSTEM', 'Radar job failed', { error });
  } finally {
    metricsService.recordJob('radar', Date.now() - start, success);
  }
}

async function watchlistJobRunner() {
  const watchlist = jobState.getWatchlist();
  if (watchlist.length === 0) return;

  const start = Date.now();
  let success = true;
  try {
    const result = await runWatchlistJob(watchlist);

    // Check alerts and emit each via event bus
    const alerts = alertService.checkAlerts(result.pools);
    for (const alert of alerts) {
      await eventBus.emit('ALERT_FIRED', alert);
    }
  } catch (error) {
    success = false;
    logService.error('SYSTEM', 'Watchlist job failed', { error });
  } finally {
    metricsService.recordJob('watchlist', Date.now() - start, success);
  }
}

async function recommendationJobRunner() {
  // Fonte primária: radarResults. Fallback: pools do MemoryStore
  let poolsWithScores = jobState.getRadarResults();

  if (poolsWithScores.length === 0) {
    // Fallback: gerar scores a partir das pools em memória (cold-start ou radar vazio)
    const memPools = memoryStore.getAllPools();
    if (memPools.length === 0) {
      logService.warn('SYSTEM', 'No radar results or cached pools for recommendations');
      return;
    }

    poolsWithScores = memPools.map(p => {
      const pool: Pool = {
        externalId: p.id,
        chain: p.chain,
        protocol: p.protocol,
        poolAddress: p.poolAddress,
        token0: p.token0,
        token1: p.token1,
        tvl: p.tvlUSD,
        volume24h: p.volume24hUSD,
        fees24h: p.fees24hUSD || 0,
        apr: p.aprFee || p.apr || 0,
        feeTier: p.feeTier || 0.003,
        bluechip: p.bluechip || false,
        volatilityAnn: p.volatilityAnn,
      };
      const score = memoryStore.getScore(p.id) || scoreService.calculateScore(pool);
      return { pool, score };
    });

    logService.info('SYSTEM', `Using ${poolsWithScores.length} cached pools for recommendations (radar empty)`);
  }

  const start = Date.now();
  let success = true;
  try {
    const capital = config.defaults.capital;

    // Gerar recomendações para todos os modos para que o filtro por modo nas rotas funcione
    const allModes: Array<'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE'> = ['DEFENSIVE', 'NORMAL', 'AGGRESSIVE'];
    const allRecommendations = allModes.flatMap(m =>
      recommendationService.generateTop3(poolsWithScores, m, capital, 10)
    );

    // Só atualizar se temos resultados — nunca descartar recomendações boas por dados vazios
    if (allRecommendations.length > 0) {
      jobState.setRecommendations(allRecommendations);
      memoryStore.setRecommendations(allRecommendations);
    } else {
      logService.warn('SYSTEM', 'Recommendation job produced 0 results — keeping previous');
    }

    // Emit top recommendation via event bus (listener aplica deduplicação)
    if (allRecommendations.length > 0) {
      await eventBus.emit('RECOMMENDATION_UPDATED', {
        recommendation: allRecommendations[0],
        poolId: allRecommendations[0].pool.externalId,
      });
    }

    logService.info('SYSTEM', 'Generated ' + allRecommendations.length + ' recommendations');
  } catch (error) {
    success = false;
    logService.error('SYSTEM', 'Recommendation job failed', { error });
  } finally {
    metricsService.recordJob('recommendation', Date.now() - start, success);
  }
}

async function healthJobRunner() {
  const start = Date.now();
  let success = true;
  try {
    const health = await getAllProvidersHealth();
    const unhealthy = health.filter(h => !h.isHealthy);

    // Provider health check — só WARN para provedores mandatórios
    if (unhealthy.length > 0) {
      const mandatoryUnhealthy = unhealthy.filter(h => !h.isOptional);
      const optionalUnhealthy = unhealthy.filter(h => h.isOptional);

      if (mandatoryUnhealthy.length > 0) {
        logService.warn('SYSTEM', 'Unhealthy providers detected', { unhealthy: mandatoryUnhealthy });
      } else if (optionalUnhealthy.length > 0) {
        // Provedores opcionais sem config são esperados — não gerar ruído de WARN
        logService.info('SYSTEM', 'Optional providers not configured', {
          providers: optionalUnhealthy.map(h => ({ name: h.name, note: h.note })),
        });
      }

      if (unhealthy.length >= health.length / 2) {
        await eventBus.emit('HEALTH_DEGRADED', {
          status: 'DEGRADED',
          message: 'Provedores com problema: ' + unhealthy.map(h => h.name).join(', '),
        });
      }
    }

    // Error rate spike detection (>10% errors in last 5 minutes)
    const errorRate = metricsService.getErrorRate(5);
    if (errorRate > 0.10) {
      await eventBus.emit('HEALTH_DEGRADED', {
        status: 'DEGRADED',
        message: 'Taxa de erro alta: ' + (errorRate * 100).toFixed(1) + '% nos ultimos 5 minutos',
      });
      logService.warn('METRICS', 'Error rate spike detected', { errorRate: (errorRate * 100).toFixed(1) + '%' });
    }

    // Memory threshold alert (>400MB RSS on free tier)
    const mem = metricsService.getMemoryUsage();
    if (mem.rssMB > 400) {
      await eventBus.emit('HEALTH_DEGRADED', {
        status: 'DEGRADED',
        message: 'Uso de memoria alto: ' + mem.rssMB + 'MB RSS (heap: ' + mem.heapUsedMB + 'MB)',
      });
      logService.warn('METRICS', 'High memory usage', { rssMB: mem.rssMB, heapUsedMB: mem.heapUsedMB });
    }
  } catch (error) {
    success = false;
    logService.error('SYSTEM', 'Health check failed', { error });
  } finally {
    metricsService.recordJob('health', Date.now() - start, success);
  }
}

async function rangeCheckJobRunner() {
  const start = Date.now();
  let success = true;
  try {
    const stats = rangeMonitorService.getStats();
    if (stats.activePositions === 0) return;

    await rangeMonitorService.checkAllPositions();
    logService.info('SYSTEM', 'Range check completed', { activePositions: stats.activePositions });
  } catch (error) {
    success = false;
    logService.error('SYSTEM', 'Range check job failed', { error });
  } finally {
    metricsService.recordJob('rangeCheck', Date.now() - start, success);
  }
}

async function dailyReportJobRunner() {
  const start = Date.now();
  let success = true;
  try {
    const settings = notificationSettingsService.getSettings();
    if (!settings.notifications.dailyReport) return;
    if (!telegramBot.isEnabled()) return;
    if (rangeMonitorService.getStats().activePositions === 0) return;

    const tz = config.reportTimezone;
    const isReportTime = isTimeMatch(settings.dailyReportHour, settings.dailyReportMinute, tz);
    if (!isReportTime) return;

    const todayStr = todayStringTz(tz);
    if (jobState.getLastDailyReportDate() === todayStr) return;

    jobState.setLastDailyReportDate(todayStr);
    await eventBus.emit('DAILY_REPORT', {});
  } catch (error) {
    success = false;
    logService.error('SYSTEM', 'Daily report job failed', { error });
  } finally {
    metricsService.recordJob('dailyReport', Date.now() - start, success);
  }
}

// ============================================
// INITIALIZE CRON JOBS
// ============================================
export async function initializeJobs() {
  logService.info('SYSTEM', 'Initializing scheduled jobs');

  // Cold-start: hydrate MemoryStore from DB
  try {
    const dbPools = await dbSyncService.loadPoolsFromDb();
    if (dbPools.length > 0) {
      memoryStore.setPools(dbPools);
      logService.info('SYSTEM', `Cold-start: loaded ${dbPools.length} pools from DB`);
    }

    const dbScores = await dbSyncService.loadScoresFromDb();
    for (const [poolId, score] of dbScores) {
      memoryStore.setScore(poolId, score);
    }
    if (dbScores.size > 0) {
      logService.info('SYSTEM', `Cold-start: loaded ${dbScores.size} scores from DB`);
    }
  } catch (err) {
    logService.warn('SYSTEM', 'Cold-start DB hydration failed (will fetch fresh)', { error: String(err) });
  }

  // ============================================
  // REGISTRAR LISTENERS DO EVENT BUS
  // ============================================

  // POOLS_UPDATED: propaga contagem e atualizações por pool via WebSocket
  eventBus.on('POOLS_UPDATED', async (event) => {
    const { count, pools } = event.payload as { count: number; pools: UnifiedPool[] };
    wsService.broadcastPoolsUpdated(count);
    for (const pool of pools) {
      wsService.broadcastPoolUpdate(pool);
    }
  });

  // RECOMMENDATION_UPDATED: envia nova recomendação top via Telegram (com deduplicação)
  eventBus.on('RECOMMENDATION_UPDATED', async (event) => {
    const { recommendation, poolId } = event.payload as { recommendation: Recommendation; poolId: string };
    if (
      telegramBot.isEnabled() &&
      notificationSettingsService.isEnabled('newRecommendation') &&
      poolId !== jobState.getLastSentRecommendationId()
    ) {
      jobState.setLastSentRecommendationId(poolId);
      await telegramBot.sendRecommendation(recommendation);
      logService.info('SYSTEM', 'New top recommendation sent via Telegram', { poolId });
    }
  });

  // HEALTH_DEGRADED: envia alerta de saúde via Telegram (com cooldown)
  eventBus.on('HEALTH_DEGRADED', async (event) => {
    const { status, message } = event.payload as { status: string; message: string };
    const now = Date.now();
    const canAlert =
      telegramBot.isEnabled() &&
      notificationSettingsService.isEnabled('systemAlerts') &&
      now - jobState.getLastHealthAlertTime() > jobState.HEALTH_ALERT_COOLDOWN;
    if (canAlert) {
      jobState.setLastHealthAlertTime(now);
      await telegramBot.sendHealthAlert(status, message);
    }
  });

  // DAILY_REPORT: dispara relatório de portfólio via range monitor
  eventBus.on('DAILY_REPORT', async () => {
    await rangeMonitorService.sendPortfolioReport();
  });

  // Deep Analysis: every 10 min (pre-populate cache for favorites/recommendations)
  cron.schedule('*/10 * * * *', async () => {
    const start = Date.now();
    let success = true;
    try {
      await runDeepAnalysisJob();
    } catch (error) {
      success = false;
      logService.error('SYSTEM', 'Deep analysis job failed', { error });
    } finally {
      metricsService.recordJob('deepAnalysis', Date.now() - start, success);
    }
  });

  cron.schedule('*/15 * * * *', radarJobRunner);       // Radar: every 15 min
  cron.schedule('* * * * *', watchlistJobRunner);       // Watchlist: every min
  cron.schedule('*/5 * * * *', recommendationJobRunner); // Recommendations: every 5 min
  cron.schedule('* * * * *', healthJobRunner);          // Health: every min
  cron.schedule('*/2 * * * *', rangeCheckJobRunner);    // Range: every 2 min
  cron.schedule('* * * * *', dailyReportJobRunner);     // Daily report: checked every min

  // MemoryStore eviction: hourly
  cron.schedule('0 * * * *', () => {
    const evicted = memoryStore.evictStale();
    logService.info('SYSTEM', 'MemoryStore eviction done', { evicted, ...memoryStore.getStats() });
  });

  // Cleanup old snapshots: daily at 3 AM
  cron.schedule('0 3 * * *', async () => {
    await dbSyncService.cleanupOldSnapshots(30);
  });

  // Run initial jobs in sequence
  setTimeout(async () => {
    await radarJobRunner();
    setTimeout(recommendationJobRunner, 2000);
  }, 3000);

  logService.info('SYSTEM', 'Jobs initialized (including range monitoring, daily report & memory eviction)');
}

/** Expõe stats do MemoryStore para o endpoint /health */
export function getMemoryStoreStats() {
  return memoryStore.getStats();
}
