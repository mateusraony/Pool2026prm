import { getPoolsWithFallback } from '../adapters/index.js';
import { scoreService } from '../services/score.service.js';
import { logService } from '../services/log.service.js';
import { config } from '../config/index.js';
import { Pool, Score } from '../types/index.js';

interface RadarResult {
  chain: string;
  poolsDiscovered: number;
  poolsAnalyzed: number;
  poolsFiltered: number;
  topCandidates: { pool: Pool; score: Score }[];
  timestamp: Date;
}

export async function runRadarJob(): Promise<RadarResult[]> {
  logService.info('RADAR', 'Starting radar job');
  const results: RadarResult[] = [];
  
  for (const chain of config.defaults.chains) {
    try {
      const result = await scanChain(chain);
      results.push(result);
    } catch (error) {
      logService.error('RADAR', 'Failed to scan chain: ' + chain, { error });
    }
  }
  
  logService.info('RADAR', 'Radar job completed', {
    chainsScanned: results.length,
    totalPools: results.reduce((sum, r) => sum + r.poolsDiscovered, 0),
  });
  
  return results;
}

async function scanChain(chain: string): Promise<RadarResult> {
  const startTime = Date.now();
  
  // Fetch pools from providers
  const { pools, provider, usedFallback } = await getPoolsWithFallback(chain, 100);
  
  logService.info('RADAR', 'Fetched pools for ' + chain, {
    count: pools.length,
    provider,
    usedFallback,
  });
  
  // Apply basic filters
  const filtered = pools.filter(pool => {
    // Minimum liquidity
    if (pool.tvl < config.thresholds.minLiquidity) return false;
    
    // Minimum volume
    if (pool.volume24h < config.thresholds.minVolume24h) return false;
    
    return true;
  });
  
  // Calculate scores
  const scored: { pool: Pool; score: Score }[] = [];
  for (const pool of filtered) {
    try {
      const score = scoreService.calculateScore(pool);
      scored.push({ pool, score });
    } catch (error) {
      logService.warn('RADAR', 'Failed to score pool', { 
        pool: pool.externalId, 
        error 
      });
    }
  }
  
  // Sort by score and take top candidates
  scored.sort((a, b) => b.score.total - a.score.total);
  const topCandidates = scored.slice(0, 20); // Top 20 per chain
  
  const duration = Date.now() - startTime;
  logService.info('RADAR', 'Chain scan completed: ' + chain, {
    duration,
    discovered: pools.length,
    filtered: filtered.length,
    topCandidates: topCandidates.length,
  });
  
  return {
    chain,
    poolsDiscovered: pools.length,
    poolsAnalyzed: filtered.length,
    poolsFiltered: pools.length - filtered.length,
    topCandidates,
    timestamp: new Date(),
  };
}
