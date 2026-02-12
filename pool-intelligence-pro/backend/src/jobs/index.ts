import cron from 'node-cron';
import { runRadarJob } from './radar.job.js';
import { runWatchlistJob } from './watchlist.job.js';
import { scoreService } from '../services/score.service.js';
import { recommendationService } from '../services/recommendation.service.js';
import { alertService } from '../services/alert.service.js';
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

// Initialize cron jobs
export function initializeJobs() {
  logService.info('SYSTEM', 'Initializing scheduled jobs');
  
  // Radar: every 30 minutes
  cron.schedule('*/30 * * * *', radarJobRunner);
  
  // Watchlist: every minute
  cron.schedule('* * * * *', watchlistJobRunner);
  
  // Recommendations: every hour
  cron.schedule('0 * * * *', recommendationJobRunner);
  
  // Health check: every minute
  cron.schedule('* * * * *', healthJobRunner);
  
  // Run initial radar scan
  setTimeout(radarJobRunner, 5000);
  
  logService.info('SYSTEM', 'Jobs initialized');
}
