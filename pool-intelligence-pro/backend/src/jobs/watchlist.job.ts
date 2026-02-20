import { getPoolWithFallback } from '../adapters/index.js';
import { logService } from '../services/log.service.js';
import { cacheService } from '../services/cache.service.js';
import { memoryStore } from '../services/memory-store.service.js';
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

/**
 * Convert a MemoryStore UnifiedPool into the legacy Pool format
 * used by the watchlist result consumers (alerts, etc).
 */
function unifiedToPool(u: { id: string; chain: string; protocol: string; poolAddress: string;
  token0: any; token1: any; feeTier: number; price?: number; tvlUSD: number;
  volume24hUSD: number; fees24hUSD: number | null; aprTotal: number | null; aprFee: number | null; apr?: number;
}): Pool {
  return {
    externalId: u.id,
    chain: u.chain,
    protocol: u.protocol,
    poolAddress: u.poolAddress,
    token0: u.token0,
    token1: u.token1,
    feeTier: u.feeTier,
    price: u.price,
    tvl: u.tvlUSD,
    volume24h: u.volume24hUSD,
    fees24h: u.fees24hUSD ?? 0,
    apr: u.aprTotal ?? u.aprFee ?? u.apr ?? 0,
  } as Pool;
}

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
      let pool: Pool | null = null;
      let provider = '';
      let usedFallback = false;

      // 1. Check MemoryStore first (populated by radar job — avoids external API calls)
      //    This also handles DefiLlama UUID-style addresses that external providers can't resolve.
      const memPool = memoryStore.getPool(item.poolId)
        ?? memoryStore.getAllPools().find(p =>
            p.chain === item.chain && (p.poolAddress === item.address || p.id === `${item.chain}_${item.address}`)
          );

      if (memPool) {
        pool = unifiedToPool(memPool);
        provider = 'memory-store';
      }

      // 2. Only fall back to external providers if not found in memory
      //    AND the address looks like a real on-chain address (starts with 0x)
      if (!pool && item.address.startsWith('0x')) {
        const fb = await getPoolWithFallback(item.chain, item.address);
        pool = fb.pool;
        provider = fb.provider;
        usedFallback = fb.usedFallback;
      }

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
        logService.warn('WATCHLIST', 'Failed to fetch pool (not in memory, address may be non-0x)', {
          poolId: item.poolId,
          address: item.address.slice(0, 10) + '...',
        });
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
