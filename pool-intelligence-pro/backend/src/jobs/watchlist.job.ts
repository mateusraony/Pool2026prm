import { getPoolWithFallback } from '../adapters/index.js';
import { logService } from '../services/log.service.js';
import { cacheService } from '../services/cache.service.js';
import { Pool } from '../types/index.js';

interface WatchlistItem {
  poolId: string;
  chain: string;
  address: string;
}

interface WatchlistResult {
  updated: number;
  failed: number;
  stale: number;
  pools: Map<string, { pool: Pool; previousPool?: Pool }>;
}

// In-memory store for previous state (would be DB in production)
let previousPools: Map<string, Pool> = new Map();

export async function runWatchlistJob(watchlist: WatchlistItem[]): Promise<WatchlistResult> {
  logService.info('WATCHLIST', 'Starting watchlist update', { count: watchlist.length });
  
  const result: WatchlistResult = {
    updated: 0,
    failed: 0,
    stale: 0,
    pools: new Map(),
  };
  
  for (const item of watchlist) {
    try {
      const { pool, provider, usedFallback } = await getPoolWithFallback(
        item.chain,
        item.address
      );
      
      if (pool) {
        const previousPool = previousPools.get(item.poolId);
        result.pools.set(item.poolId, { pool, previousPool });
        previousPools.set(item.poolId, pool);
        result.updated++;
        
        if (usedFallback) {
          result.stale++;
          logService.warn('WATCHLIST', 'Used fallback for pool', { 
            poolId: item.poolId, 
            provider 
          });
        }
      } else {
        result.failed++;
        logService.warn('WATCHLIST', 'Failed to fetch pool', { poolId: item.poolId });
      }
    } catch (error) {
      result.failed++;
      logService.error('WATCHLIST', 'Error updating pool', { 
        poolId: item.poolId, 
        error 
      });
    }
  }
  
  logService.info('WATCHLIST', 'Watchlist update completed', {
    updated: result.updated,
    failed: result.failed,
    stale: result.stale,
  });
  
  return result;
}
