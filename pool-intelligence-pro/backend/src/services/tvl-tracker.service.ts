/**
 * TVL Tracker Service
 * Tracks TVL snapshots for each pool over a 24h rolling window.
 * Calculates tvlPeak24h and dropPercent for liquidityDropPenalty.
 *
 * Storage: in-memory (no DB required).
 * - Radar runs every 15 min → ~96 snapshots per pool per 24h
 * - With max 500 pools: ~48K entries → ~2MB RAM (trivial)
 * - Automatically evicts data older than 25h
 */

import { logService } from './log.service.js';

// --- Types ---

interface TvlSnapshot {
  timestamp: number;  // Date.now()
  tvl: number;
}

export interface TvlDropResult {
  /** Current TVL */
  tvlNow: number;
  /** Peak TVL in last 24h */
  tvlPeak24h: number;
  /** Drop percentage from peak (0-100) */
  dropPercent: number;
  /** Number of snapshots in window */
  dataPoints: number;
  /** Calculated penalty (0-20 points) */
  liquidityDropPenalty: number;
}

// --- Configuration ---

const WINDOW_MS = 24 * 60 * 60 * 1000;   // 24 hours
const EVICT_MS = 25 * 60 * 60 * 1000;    // 25 hours (keep slightly beyond window)
const MAX_POOLS = 600;                     // Memory safety cap

// --- State ---

const snapshots = new Map<string, TvlSnapshot[]>();
let lastEviction = Date.now();

// --- Core ---

/**
 * Remove snapshots older than 25h for all pools.
 * Also removes pools that haven't been updated.
 */
function evictStale(): number {
  const cutoff = Date.now() - EVICT_MS;
  let evicted = 0;

  for (const [poolId, snaps] of snapshots) {
    const fresh = snaps.filter(s => s.timestamp >= cutoff);
    if (fresh.length === 0) {
      snapshots.delete(poolId);
      evicted++;
    } else if (fresh.length < snaps.length) {
      snapshots.set(poolId, fresh);
      evicted += snaps.length - fresh.length;
    }
  }

  // Memory safety: if too many pools, remove least-recently-updated
  if (snapshots.size > MAX_POOLS) {
    const entries = Array.from(snapshots.entries())
      .map(([id, snaps]) => ({
        id,
        lastUpdate: snaps.length > 0 ? snaps[snaps.length - 1].timestamp : 0,
      }))
      .sort((a, b) => a.lastUpdate - b.lastUpdate);

    const toRemove = entries.slice(0, snapshots.size - MAX_POOLS);
    for (const { id } of toRemove) {
      snapshots.delete(id);
      evicted++;
    }
  }

  lastEviction = Date.now();
  return evicted;
}

// --- Public API ---

/**
 * Record a TVL snapshot for a pool.
 * Called during radar job after fetching pool data.
 */
export function recordTvl(poolId: string, tvl: number): void {
  if (tvl <= 0) return;

  let snaps = snapshots.get(poolId);
  if (!snaps) {
    snaps = [];
    snapshots.set(poolId, snaps);
  }

  // Don't record if the last snapshot was < 1 minute ago (debounce)
  const lastSnap = snaps[snaps.length - 1];
  if (lastSnap && Date.now() - lastSnap.timestamp < 60_000) {
    // Update the last snapshot's TVL instead
    lastSnap.tvl = tvl;
    return;
  }

  snaps.push({ timestamp: Date.now(), tvl });

  // Periodic eviction (every 30 minutes)
  if (Date.now() - lastEviction > 30 * 60 * 1000) {
    evictStale();
  }
}

/**
 * Record TVL for multiple pools at once (batch — called by radar job).
 */
export function recordBatchTvl(pools: { id: string; tvl: number }[]): void {
  for (const { id, tvl } of pools) {
    recordTvl(id, tvl);
  }
}

/**
 * Get TVL drop analysis for a pool.
 * Returns peak TVL in 24h window, current TVL, and drop percentage.
 */
export function getTvlDrop(poolId: string, currentTvl?: number): TvlDropResult {
  const snaps = snapshots.get(poolId);
  const cutoff = Date.now() - WINDOW_MS;

  if (!snaps || snaps.length === 0) {
    const tvl = currentTvl || 0;
    return {
      tvlNow: tvl,
      tvlPeak24h: tvl,
      dropPercent: 0,
      dataPoints: 0,
      liquidityDropPenalty: 0,
    };
  }

  // Filter to 24h window
  const windowSnaps = snaps.filter(s => s.timestamp >= cutoff);
  if (windowSnaps.length === 0) {
    const tvl = currentTvl || snaps[snaps.length - 1].tvl;
    return {
      tvlNow: tvl,
      tvlPeak24h: tvl,
      dropPercent: 0,
      dataPoints: 0,
      liquidityDropPenalty: 0,
    };
  }

  const tvlNow = currentTvl ?? windowSnaps[windowSnaps.length - 1].tvl;
  const tvlPeak24h = Math.max(...windowSnaps.map(s => s.tvl));

  let dropPercent = 0;
  if (tvlPeak24h > 0 && tvlNow < tvlPeak24h) {
    dropPercent = ((tvlPeak24h - tvlNow) / tvlPeak24h) * 100;
  }

  // Penalty mapping (mirrors backend score.service.ts calculateLiquidityDropPenalty)
  let liquidityDropPenalty = 0;
  if (dropPercent >= 50) liquidityDropPenalty = 20;
  else if (dropPercent >= 30) liquidityDropPenalty = 15;
  else if (dropPercent >= 20) liquidityDropPenalty = 10;
  else if (dropPercent >= 10) liquidityDropPenalty = 5;

  return {
    tvlNow,
    tvlPeak24h: Math.round(tvlPeak24h),
    dropPercent: Math.round(dropPercent * 10) / 10,
    dataPoints: windowSnaps.length,
    liquidityDropPenalty,
  };
}

/**
 * Get TVL drop data for multiple pools (batch).
 */
export function getBatchTvlDrop(
  pools: { id: string; tvl: number }[]
): Map<string, TvlDropResult> {
  const results = new Map<string, TvlDropResult>();
  for (const { id, tvl } of pools) {
    results.set(id, getTvlDrop(id, tvl));
  }
  return results;
}

/**
 * Get stats for monitoring.
 */
export function getStats(): {
  trackedPools: number;
  totalSnapshots: number;
  oldestSnapshotAge: number;
} {
  let totalSnapshots = 0;
  let oldestTimestamp = Date.now();

  for (const snaps of snapshots.values()) {
    totalSnapshots += snaps.length;
    if (snaps.length > 0 && snaps[0].timestamp < oldestTimestamp) {
      oldestTimestamp = snaps[0].timestamp;
    }
  }

  return {
    trackedPools: snapshots.size,
    totalSnapshots,
    oldestSnapshotAge: Math.round((Date.now() - oldestTimestamp) / 60000), // in minutes
  };
}

/**
 * Clear all data (for testing).
 */
export function clear(): void {
  snapshots.clear();
}

export const tvlTrackerService = {
  recordTvl,
  recordBatchTvl,
  getTvlDrop,
  getBatchTvlDrop,
  getStats,
  evictStale,
  clear,
};
