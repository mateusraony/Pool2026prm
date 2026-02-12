import { Router } from 'express';
import { getPoolsWithFallback, getPoolWithFallback, getAllProvidersHealth } from '../adapters/index.js';
import { scoreService } from '../services/score.service.js';
import { cacheService } from '../services/cache.service.js';
import { logService } from '../services/log.service.js';
import { alertService } from '../services/alert.service.js';
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
    const recommendations = getLatestRecommendations();
    
    res.json({
      success: true,
      data: recommendations,
      mode: config.defaults.mode,
      capital: config.defaults.capital,
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

// Get settings
router.get('/settings', async (req, res) => {
  res.json({
    success: true,
    data: {
      mode: config.defaults.mode,
      capital: config.defaults.capital,
      chains: config.defaults.chains,
      thresholds: config.thresholds,
      scoreWeights: config.scoreWeights,
    },
    timestamp: new Date(),
  });
});

export default router;
