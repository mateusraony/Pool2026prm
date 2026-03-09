import cron from 'node-cron';
import { runRadarJob } from './radar.job.js';
import { runWatchlistJob } from './watchlist.job.js';
import { scoreService } from '../services/score.service.js';
import { recommendationService } from '../services/recommendation.service.js';
import { alertService } from '../services/alert.service.js';
import { rangeMonitorService } from '../services/range.service.js';
import { notificationSettingsService } from '../services/notification-settings.service.js';
import { telegramBot } from '../bot/telegram.js';
import { getAllProvidersHealth } from '../adapters/index.js';
import { logService } from '../services/log.service.js';
import { config } from '../config/index.js';
import { Pool, Score, Recommendation } from '../types/index.js';
import { memoryStore } from '../services/memory-store.service.js';
import { poolIntelligenceService } from '../services/pool-intelligence.service.js';

// State legado (mantido para compatibilidade com rotas existentes)
let latestRadarResults: { pool: Pool; score: Score }[] = [];
let latestRecommendations: Recommendation[] = [];
let watchlist: { poolId: string; chain: string; address: string }[] = [];

// ============================================
// SPAM PREVENTION: Track what was already sent
// ============================================
let lastSentRecommendationId = '';       // Pool ID of last sent recommendation
let lastHealthAlertTime = 0;             // Timestamp of last health alert
const HEALTH_ALERT_COOLDOWN = 30 * 60 * 1000; // 30 min between health alerts
let lastDailyReportDate = '';            // "YYYY-MM-DD" of last sent daily report

// Export state accessors
export function getLatestRadarResults() { return latestRadarResults; }
export function getLatestRecommendations() { return latestRecommendations; }
export function getWatchlist() { return watchlist; }
export function addToWatchlist(item: { poolId: string; chain: string; address: string }) {
  if (!watchlist.find(w => w.poolId === item.poolId)) {
    watchlist.push(item);
    memoryStore.addToWatchlist(item.poolId);
  }
}
export function removeFromWatchlist(poolId: string) {
  watchlist = watchlist.filter(w => w.poolId !== poolId);
  memoryStore.removeFromWatchlist(poolId);
}

// Job runners
async function radarJobRunner() {
  try {
    const results = await runRadarJob();

    // Flatten and store top candidates from all chains
    latestRadarResults = results.flatMap(r => r.topCandidates);

    // Popula o MemoryStore com UnifiedPool já enriquecidos
    const unifiedPools = latestRadarResults.map(r =>
      poolIntelligenceService.enrichToUnifiedPool(r.pool, { updatedAt: new Date() })
    );
    memoryStore.setPools(unifiedPools);

    // Armazena scores por pool no MemoryStore
    for (const r of latestRadarResults) {
      memoryStore.setScore(r.pool.externalId, r.score);
    }

    logService.info('SYSTEM', 'Radar job stored ' + latestRadarResults.length + ' candidates', {
      memoryStore: memoryStore.getStats(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'Radar job failed', { error });
  }
}

async function watchlistJobRunner() {
  if (watchlist.length === 0) return;

  try {
    const result = await runWatchlistJob(watchlist);

    // Check alerts
    const alerts = alertService.checkAlerts(result.pools);

    // Send alerts to Telegram only if enabled and notification type is on
    if (telegramBot.isEnabled() && alerts.length > 0) {
      const settings = notificationSettingsService.getSettings();
      for (const alert of alerts) {
        // Only send if this alert type is enabled in notification settings
        if (settings.notifications.priceAlerts) {
          await telegramBot.sendAlert(alert);
        }
      }
    }
  } catch (error) {
    logService.error('SYSTEM', 'Watchlist job failed', { error });
  }
}

async function recommendationJobRunner() {
  if (latestRadarResults.length === 0) {
    logService.warn('SYSTEM', 'No radar results for recommendations');
    return;
  }

  try {
    const mode = config.defaults.mode;
    const capital = config.defaults.capital;

    latestRecommendations = recommendationService.generateTop3(
      latestRadarResults,
      mode,
      capital
    );

    // Persiste recomendações no MemoryStore para leitura imediata pelas rotas
    memoryStore.setRecommendations(latestRecommendations);

    // Send top recommendation ONLY if it's a NEW recommendation (different pool)
    // This prevents spam: without this check, it would send every 5 minutes
    if (
      latestRecommendations.length > 0 &&
      telegramBot.isEnabled() &&
      notificationSettingsService.isEnabled('newRecommendation')
    ) {
      const topPoolId = latestRecommendations[0].pool.externalId;
      if (topPoolId !== lastSentRecommendationId) {
        lastSentRecommendationId = topPoolId;
        await telegramBot.sendRecommendation(latestRecommendations[0]);
        logService.info('SYSTEM', 'New top recommendation sent via Telegram', { poolId: topPoolId });
      }
    }

    logService.info('SYSTEM', 'Generated ' + latestRecommendations.length + ' recommendations');
  } catch (error) {
    logService.error('SYSTEM', 'Recommendation job failed', { error });
  }
}

async function healthJobRunner() {
  try {
    const health = await getAllProvidersHealth();
    const unhealthy = health.filter(h => !h.isHealthy);

    if (unhealthy.length > 0) {
      logService.warn('SYSTEM', 'Unhealthy providers detected', { unhealthy });

      // Only send health alert if: telegram enabled + systemAlerts on + cooldown passed
      const now = Date.now();
      if (
        unhealthy.length >= health.length / 2 &&
        telegramBot.isEnabled() &&
        notificationSettingsService.isEnabled('systemAlerts') &&
        now - lastHealthAlertTime > HEALTH_ALERT_COOLDOWN
      ) {
        lastHealthAlertTime = now;
        await telegramBot.sendHealthAlert('DEGRADED',
          'Provedores com problema: ' + unhealthy.map(h => h.name).join(', ')
        );
      }
    }
  } catch (error) {
    logService.error('SYSTEM', 'Health check failed', { error });
  }
}

async function rangeCheckJobRunner() {
  try {
    const stats = rangeMonitorService.getStats();
    if (stats.activePositions === 0) return;

    await rangeMonitorService.checkAllPositions();
    logService.info('SYSTEM', 'Range check completed', { activePositions: stats.activePositions });
  } catch (error) {
    logService.error('SYSTEM', 'Range check job failed', { error });
  }
}

// Daily report job: check every minute if it's time to send the report
async function dailyReportJobRunner() {
  try {
    const settings = notificationSettingsService.getSettings();
    if (!settings.notifications.dailyReport) return;
    if (!telegramBot.isEnabled()) return;
    if (rangeMonitorService.getStats().activePositions === 0) return;

    const now = new Date();
    const isReportTime =
      now.getHours() === settings.dailyReportHour &&
      now.getMinutes() === settings.dailyReportMinute;

    if (!isReportTime) return;

    // Prevent sending twice on the same day (this job runs every minute)
    const todayStr = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
    if (lastDailyReportDate === todayStr) return;

    lastDailyReportDate = todayStr;
    await rangeMonitorService.sendPortfolioReport();
  } catch (error) {
    logService.error('SYSTEM', 'Daily report job failed', { error });
  }
}

// Initialize cron jobs
export function initializeJobs() {
  logService.info('SYSTEM', 'Initializing scheduled jobs');

  // Radar: every 15 minutes
  cron.schedule('*/15 * * * *', radarJobRunner);

  // Watchlist: every minute
  cron.schedule('* * * * *', watchlistJobRunner);

  // Recommendations: every 5 minutes
  cron.schedule('*/5 * * * *', recommendationJobRunner);

  // Health check: every minute
  cron.schedule('* * * * *', healthJobRunner);

  // Range check: every 2 minutes (check if user positions are near exit)
  cron.schedule('*/2 * * * *', rangeCheckJobRunner);

  // Daily portfolio report: checked every minute, fires at configured time
  cron.schedule('* * * * *', dailyReportJobRunner);

  // MemoryStore eviction: hourly — remove dados stale para manter RAM baixa
  cron.schedule('0 * * * *', () => {
    const evicted = memoryStore.evictStale();
    logService.info('SYSTEM', 'MemoryStore eviction done', { evicted, ...memoryStore.getStats() });
  });

  // Run initial jobs in sequence
  setTimeout(async () => {
    await radarJobRunner();
    // Wait 2 seconds then generate recommendations
    setTimeout(recommendationJobRunner, 2000);
  }, 3000);

  logService.info('SYSTEM', 'Jobs initialized (including range monitoring, daily report & memory eviction)');
}

/** Expõe stats do MemoryStore para o endpoint /health */
export function getMemoryStoreStats() {
  return memoryStore.getStats();
}
