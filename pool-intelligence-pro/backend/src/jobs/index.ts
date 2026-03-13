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
import { Pool, Score, Recommendation } from '../types/index.js';
import { memoryStore } from '../services/memory-store.service.js';
import { poolIntelligenceService } from '../services/pool-intelligence.service.js';

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

    // Armazena scores por pool no MemoryStore
    for (const r of radarResults) {
      memoryStore.setScore(r.pool.externalId, r.score);
    }

    logService.info('SYSTEM', 'Radar job stored ' + radarResults.length + ' candidates', {
      memoryStore: memoryStore.getStats(),
    });
  } catch (error) {
    logService.error('SYSTEM', 'Radar job failed', { error });
  }
}

async function watchlistJobRunner() {
  const watchlist = jobState.getWatchlist();
  if (watchlist.length === 0) return;

  try {
    const result = await runWatchlistJob(watchlist);

    // Check alerts
    const alerts = alertService.checkAlerts(result.pools);

    // Send alerts to Telegram only if enabled and notification type is on
    if (telegramBot.isEnabled() && alerts.length > 0) {
      const settings = notificationSettingsService.getSettings();
      for (const alert of alerts) {
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
  const radarResults = jobState.getRadarResults();
  if (radarResults.length === 0) {
    logService.warn('SYSTEM', 'No radar results for recommendations');
    return;
  }

  try {
    const mode = config.defaults.mode;
    const capital = config.defaults.capital;

    const recommendations = recommendationService.generateTop3(radarResults, mode, capital);
    jobState.setRecommendations(recommendations);

    // Persiste recomendações no MemoryStore para leitura imediata pelas rotas
    memoryStore.setRecommendations(recommendations);

    // Send top recommendation ONLY if it's a NEW recommendation (different pool)
    if (
      recommendations.length > 0 &&
      telegramBot.isEnabled() &&
      notificationSettingsService.isEnabled('newRecommendation')
    ) {
      const topPoolId = recommendations[0].pool.externalId;
      if (topPoolId !== jobState.getLastSentRecommendationId()) {
        jobState.setLastSentRecommendationId(topPoolId);
        await telegramBot.sendRecommendation(recommendations[0]);
        logService.info('SYSTEM', 'New top recommendation sent via Telegram', { poolId: topPoolId });
      }
    }

    logService.info('SYSTEM', 'Generated ' + recommendations.length + ' recommendations');
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

      const now = Date.now();
      if (
        unhealthy.length >= health.length / 2 &&
        telegramBot.isEnabled() &&
        notificationSettingsService.isEnabled('systemAlerts') &&
        now - jobState.getLastHealthAlertTime() > jobState.HEALTH_ALERT_COOLDOWN
      ) {
        jobState.setLastHealthAlertTime(now);
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

    const todayStr = now.toISOString().slice(0, 10);
    if (jobState.getLastDailyReportDate() === todayStr) return;

    jobState.setLastDailyReportDate(todayStr);
    await rangeMonitorService.sendPortfolioReport();
  } catch (error) {
    logService.error('SYSTEM', 'Daily report job failed', { error });
  }
}

// ============================================
// INITIALIZE CRON JOBS
// ============================================
export function initializeJobs() {
  logService.info('SYSTEM', 'Initializing scheduled jobs');

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
