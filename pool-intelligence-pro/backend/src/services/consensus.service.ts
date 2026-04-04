/**
 * Consensus Service
 * Compares pool metrics across multiple providers (DefiLlama, GeckoTerminal, DexScreener)
 * to detect data inconsistencies and calculate inconsistencyPenalty.
 *
 * Strategy:
 * - After radar fetches from primary source (DefiLlama), batch-compare TVL and volume
 *   with a secondary source (GeckoTerminal multi_pools endpoint).
 * - For individual pools (watchlist, detail), query 2-3 sources in parallel.
 * - Divergence > configurable threshold → penalty + log.
 */

import axios from 'axios';
import { Pool } from '../types/index.js';
import { cacheService } from './cache.service.js';
import { logService } from './log.service.js';
import { config } from '../config/index.js';

// --- Types ---

export interface ConsensusResult {
  poolAddress: string;
  chain: string;
  /** TVL values from each source */
  tvlBySource: Record<string, number>;
  /** Volume24h values from each source */
  volumeBySource: Record<string, number>;
  /** Max divergence % across TVL and volume */
  maxDivergence: number;
  /** Individual divergence values */
  tvlDivergence: number;
  volumeDivergence: number;
  /** Sources that contributed */
  sources: string[];
  /** Calculated penalty (0-15 points) */
  inconsistencyPenalty: number;
  /** Human-readable reason */
  reason: string;
}

// --- GeckoTerminal batch types ---

interface GeckoPoolAttributes {
  address: string;
  reserve_in_usd: string;
  volume_usd: { h24: string };
}

// --- Chain name mapping for GeckoTerminal ---

const GECKO_CHAIN_MAP: Record<string, string> = {
  ethereum: 'eth',
  arbitrum: 'arbitrum',
  base: 'base',
  polygon: 'polygon_pos',
  optimism: 'optimism',
  bsc: 'bsc',
};

// --- DexScreener chain mapping ---

const DEXSCREENER_CHAIN_MAP: Record<string, string> = {
  ethereum: 'ethereum',
  arbitrum: 'arbitrum',
  base: 'base',
  polygon: 'polygon',
  optimism: 'optimism',
  bsc: 'bsc',
};

// --- Core functions ---

/**
 * Calculate divergence % between two positive numbers.
 * Returns 0 if both are 0 or only one source has data.
 */
function calcDivergence(a: number, b: number): number {
  if (a <= 0 && b <= 0) return 0;
  if (a <= 0 || b <= 0) return 100; // one source has data, other doesn't
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  return ((max - min) / max) * 100;
}

/**
 * Map divergence (0-100%) to penalty (0-15 points).
 * ≤ 10%: 0 (normal variance)
 * 10-20%: 3
 * 20-30%: 7
 * 30-50%: 10
 * > 50%: 15 (severe inconsistency)
 */
function divergenceToPenalty(divergence: number): number {
  if (divergence <= 10) return 0;
  if (divergence <= 20) return 3;
  if (divergence <= 30) return 7;
  if (divergence <= 50) return 10;
  return 15;
}

/**
 * Batch-fetch TVL and volume from GeckoTerminal for multiple pools.
 * Uses the multi_pools endpoint (up to 30 addresses per call).
 */
async function fetchGeckoTerminalBatch(
  chain: string,
  addresses: string[]
): Promise<Map<string, { tvl: number; volume24h: number }>> {
  const geckoChain = GECKO_CHAIN_MAP[chain];
  if (!geckoChain) return new Map();

  const result = new Map<string, { tvl: number; volume24h: number }>();
  const cacheKey = `consensus:gecko:${chain}:${addresses.slice(0, 5).join(',')}`;
  const cached = cacheService.get<Map<string, { tvl: number; volume24h: number }>>(cacheKey);
  if (cached.data) return cached.data;

  // Batch in groups of 30
  for (let i = 0; i < addresses.length; i += 30) {
    const batch = addresses.slice(i, i + 30);
    try {
      const resp = await axios.get(
        `https://api.geckoterminal.com/api/v2/networks/${geckoChain}/pools/multi/${batch.join(',')}`,
        { timeout: 15000, headers: { Accept: 'application/json' } }
      );
      const pools: { attributes: GeckoPoolAttributes }[] = resp.data?.data || [];
      for (const p of pools) {
        const addr = p.attributes?.address?.toLowerCase();
        if (!addr) continue;
        result.set(addr, {
          tvl: parseFloat(p.attributes.reserve_in_usd) || 0,
          volume24h: parseFloat(p.attributes.volume_usd?.h24) || 0,
        });
      }
    } catch (err) {
      logService.warn('PROVIDER', `GeckoTerminal consensus batch failed for ${chain}`, {
        batchSize: batch.length,
        error: (err as Error).message,
      });
    }
  }

  // Cache for 5 minutes
  if (result.size > 0) {
    cacheService.set(cacheKey, result, 300);
  }

  return result;
}

/**
 * Fetch single pool from DexScreener.
 */
async function fetchDexScreenerPool(
  chain: string,
  address: string
): Promise<{ tvl: number; volume24h: number } | null> {
  const dexChain = DEXSCREENER_CHAIN_MAP[chain];
  if (!dexChain) return null;

  const cacheKey = `consensus:dexscreener:${chain}:${address}`;
  const cached = cacheService.get<{ tvl: number; volume24h: number }>(cacheKey);
  if (cached.data) return cached.data;

  try {
    const resp = await axios.get(
      `https://api.dexscreener.com/latest/dex/pairs/${dexChain}/${address}`,
      { timeout: 10000 }
    );
    const pair = resp.data?.pair || resp.data?.pairs?.[0];
    if (!pair) return null;

    const result = {
      tvl: parseFloat(pair.liquidity?.usd) || 0,
      volume24h: parseFloat(pair.volume?.h24) || 0,
    };

    cacheService.set(cacheKey, result, 300);
    return result;
  } catch {
    return null;
  }
}

// --- Public API ---

/**
 * Run batch consensus for a list of pools from the primary source (DefiLlama).
 * Compares with GeckoTerminal in batch (efficient — 1 API call per 30 pools).
 *
 * Returns a Map<poolAddress, ConsensusResult> with penalties for each pool.
 */
export async function runBatchConsensus(
  chain: string,
  pools: Pool[]
): Promise<Map<string, ConsensusResult>> {
  const results = new Map<string, ConsensusResult>();

  // Only compare pools with real 0x addresses
  const comparablePools = pools.filter(p => p.poolAddress.startsWith('0x'));
  if (comparablePools.length === 0) return results;

  const addresses = comparablePools.map(p => p.poolAddress.toLowerCase());

  // Fetch secondary source in batch
  const geckoData = await fetchGeckoTerminalBatch(chain, addresses);

  for (const pool of comparablePools) {
    const addr = pool.poolAddress.toLowerCase();
    const gecko = geckoData.get(addr);

    const tvlBySource: Record<string, number> = { defillama: pool.tvl };
    const volumeBySource: Record<string, number> = { defillama: pool.volume24h };

    if (gecko) {
      tvlBySource.geckoterminal = gecko.tvl;
      volumeBySource.geckoterminal = gecko.volume24h;
    }

    const sources = Object.keys(tvlBySource);

    if (sources.length < 2) {
      // Only one source — can't calculate divergence
      results.set(addr, {
        poolAddress: pool.poolAddress,
        chain,
        tvlBySource,
        volumeBySource,
        maxDivergence: 0,
        tvlDivergence: 0,
        volumeDivergence: 0,
        sources,
        inconsistencyPenalty: 0,
        reason: 'single source — no comparison possible',
      });
      continue;
    }

    // Calculate divergence
    const tvlDivergence = calcDivergence(
      tvlBySource.defillama || 0,
      tvlBySource.geckoterminal || 0
    );
    const volumeDivergence = calcDivergence(
      volumeBySource.defillama || 0,
      volumeBySource.geckoterminal || 0
    );
    const maxDivergence = Math.max(tvlDivergence, volumeDivergence);
    const inconsistencyPenalty = divergenceToPenalty(maxDivergence);

    let reason = '';
    if (maxDivergence <= 10) {
      reason = `sources agree (${maxDivergence.toFixed(1)}% divergence)`;
    } else {
      const parts: string[] = [];
      if (tvlDivergence > 10) {
        parts.push(`TVL diverges ${tvlDivergence.toFixed(1)}% ($${(tvlBySource.defillama / 1e3).toFixed(0)}K vs $${((tvlBySource.geckoterminal || 0) / 1e3).toFixed(0)}K)`);
      }
      if (volumeDivergence > 10) {
        parts.push(`Vol diverges ${volumeDivergence.toFixed(1)}% ($${(volumeBySource.defillama / 1e3).toFixed(0)}K vs $${((volumeBySource.geckoterminal || 0) / 1e3).toFixed(0)}K)`);
      }
      reason = parts.join('; ');
    }

    // Log significant divergence
    if (inconsistencyPenalty > 0) {
      logService.warn('SCORE', `Consensus divergence for ${pool.token0?.symbol}/${pool.token1?.symbol} on ${chain}`, {
        poolAddress: pool.poolAddress,
        tvlDivergence: tvlDivergence.toFixed(1),
        volumeDivergence: volumeDivergence.toFixed(1),
        penalty: inconsistencyPenalty,
        sources,
        reason,
      });
    }

    results.set(addr, {
      poolAddress: pool.poolAddress,
      chain,
      tvlBySource,
      volumeBySource,
      maxDivergence,
      tvlDivergence,
      volumeDivergence,
      sources,
      inconsistencyPenalty,
      reason,
    });
  }

  logService.info('SCORE', `Consensus: ${chain} — ${results.size} pools compared, ${
    Array.from(results.values()).filter(r => r.inconsistencyPenalty > 0).length
  } with divergence penalty`);

  return results;
}

/**
 * Run consensus for a single pool (used for watchlist/detail endpoints).
 * Queries up to 3 sources in parallel.
 */
export async function runSinglePoolConsensus(
  chain: string,
  pool: Pool
): Promise<ConsensusResult> {
  if (!pool.poolAddress.startsWith('0x')) {
    return {
      poolAddress: pool.poolAddress,
      chain,
      tvlBySource: { primary: pool.tvl },
      volumeBySource: { primary: pool.volume24h },
      maxDivergence: 0,
      tvlDivergence: 0,
      volumeDivergence: 0,
      sources: ['primary'],
      inconsistencyPenalty: 0,
      reason: 'non-0x address — consensus not applicable',
    };
  }

  // Fetch from 2 secondary sources in parallel
  const [geckoData, dexData] = await Promise.all([
    fetchGeckoTerminalBatch(chain, [pool.poolAddress.toLowerCase()]),
    fetchDexScreenerPool(chain, pool.poolAddress),
  ]);

  const tvlBySource: Record<string, number> = { primary: pool.tvl };
  const volumeBySource: Record<string, number> = { primary: pool.volume24h };

  const gecko = geckoData.get(pool.poolAddress.toLowerCase());
  if (gecko) {
    tvlBySource.geckoterminal = gecko.tvl;
    volumeBySource.geckoterminal = gecko.volume24h;
  }
  if (dexData) {
    tvlBySource.dexscreener = dexData.tvl;
    volumeBySource.dexscreener = dexData.volume24h;
  }

  const sources = Object.keys(tvlBySource);
  if (sources.length < 2) {
    return {
      poolAddress: pool.poolAddress,
      chain,
      tvlBySource,
      volumeBySource,
      maxDivergence: 0,
      tvlDivergence: 0,
      volumeDivergence: 0,
      sources,
      inconsistencyPenalty: 0,
      reason: 'single source — no comparison possible',
    };
  }

  // Calculate pairwise divergence across all sources
  const tvlValues = Object.values(tvlBySource).filter(v => v > 0);
  const volValues = Object.values(volumeBySource).filter(v => v > 0);

  let maxTvlDiv = 0;
  for (let i = 0; i < tvlValues.length; i++) {
    for (let j = i + 1; j < tvlValues.length; j++) {
      maxTvlDiv = Math.max(maxTvlDiv, calcDivergence(tvlValues[i], tvlValues[j]));
    }
  }

  let maxVolDiv = 0;
  for (let i = 0; i < volValues.length; i++) {
    for (let j = i + 1; j < volValues.length; j++) {
      maxVolDiv = Math.max(maxVolDiv, calcDivergence(volValues[i], volValues[j]));
    }
  }

  const maxDivergence = Math.max(maxTvlDiv, maxVolDiv);
  const inconsistencyPenalty = divergenceToPenalty(maxDivergence);

  const reason = maxDivergence <= 10
    ? `${sources.length} sources agree (${maxDivergence.toFixed(1)}% max divergence)`
    : `divergence ${maxDivergence.toFixed(1)}% across ${sources.join(', ')}`;

  if (inconsistencyPenalty > 0) {
    logService.warn('SCORE', `Single-pool consensus: ${pool.poolAddress} on ${chain}`, {
      tvlBySource,
      volumeBySource,
      tvlDivergence: maxTvlDiv.toFixed(1),
      volumeDivergence: maxVolDiv.toFixed(1),
      penalty: inconsistencyPenalty,
    });
  }

  return {
    poolAddress: pool.poolAddress,
    chain,
    tvlBySource,
    volumeBySource,
    maxDivergence,
    tvlDivergence: maxTvlDiv,
    volumeDivergence: maxVolDiv,
    sources,
    inconsistencyPenalty,
    reason,
  };
}

export const consensusService = {
  runBatchConsensus,
  runSinglePoolConsensus,
};
