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

// State (would be in DB in production)
let latestRadarResults: { pool: Pool; score: Score }[] = [];
let latestRecommendations: Recommendation[] = [];
let watchlist: { poolId: string; chain: string; address: string }[] = [];

// Export state accessors
export function getLatestRadarResults() { return latestRadarResults; }
export function getLatestRecommendations() { return latestRecommendations; }
export function getWatchlist() { return watchlist; }
export function addToWatchlist(item: { poolId: string; chain: string; address: string }) {
  if (!watchlist.find(w => w.poolId === item.poolId)) {
    watchlist.push(item);
  }
}
export function removeFromWatchlist(poolId: string) {
  watchlist = watchlist.filter(w => w.poolId !== poolId);
}

// Job runners
async function radarJobRunner() {
  try {
    const results = await runRadarJob();
    
    // Flatten and store top candidates from all chains
    latestRadarResults = results.flatMap(r => r.topCandidates);
    
    logService.info('SYSTEM', 'Radar job stored ' + latestRadarResults.length + ' candidates');
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
    
    // Send alerts to Telegram
    for (const alert of alerts) {
      await telegramBot.sendAlert(alert);
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
    
    // Send top recommendation to Telegram
    if (latestRecommendations.length > 0 && telegramBot.isEnabled()) {
      await telegramBot.sendRecommendation(latestRecommendations[0]);
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

      if (unhealthy.length >= health.length / 2) {
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
    if (rangeMonitorService.getStats().activePositions === 0) return;

    const now = new Date();
    const isReportTime =
      now.getHours() === settings.dailyReportHour &&
      now.getMinutes() === settings.dailyReportMinute;

    if (isReportTime) {
      await rangeMonitorService.sendPortfolioReport();
    }
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

  // Run initial jobs in sequence
  setTimeout(async () => {
    await radarJobRunner();
    // Wait 2 seconds then generate recommendations
    setTimeout(recommendationJobRunner, 2000);
  }, 3000);

  logService.info('SYSTEM', 'Jobs initialized (including range monitoring & daily report)');
}
