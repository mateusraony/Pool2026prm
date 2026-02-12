import { Pool, ProviderAdapter, ProviderHealth } from '../types/index.js';
import { defiLlamaAdapter } from './defillama.adapter.js';
import { geckoTerminalAdapter } from './geckoterminal.adapter.js';
import { dexScreenerAdapter } from './dexscreener.adapter.js';
import { circuitBreaker } from '../services/circuit-breaker.service.js';
import { logService } from '../services/log.service.js';

// Export individual adapters
export { defiLlamaAdapter } from './defillama.adapter.js';
export { geckoTerminalAdapter } from './geckoterminal.adapter.js';
export { dexScreenerAdapter } from './dexscreener.adapter.js';

// Registry of all adapters
const adapters: Record<string, ProviderAdapter> = {
  defillama: defiLlamaAdapter,
  geckoterminal: geckoTerminalAdapter,
  dexscreener: dexScreenerAdapter,
};

// Get adapter by name
export function getAdapter(name: string): ProviderAdapter | undefined {
  return adapters[name.toLowerCase()];
}

// Get all adapter names
export function getAdapterNames(): string[] {
  return Object.keys(adapters);
}

// Get pool with fallback support
export async function getPoolWithFallback(
  chain: string,
  address: string,
  primaryProvider = 'geckoterminal',
  fallbackProvider = 'dexscreener'
): Promise<{ pool: Pool | null; provider: string; usedFallback: boolean }> {
  
  // Try primary
  const primaryAdapter = getAdapter(primaryProvider);
  if (primaryAdapter && !circuitBreaker.isOpen(primaryProvider)) {
    try {
      const pool = await primaryAdapter.getPool(chain, address);
      if (pool) {
        return { pool, provider: primaryProvider, usedFallback: false };
      }
    } catch (error) {
      logService.warn('PROVIDER', 'Primary provider failed: ' + primaryProvider, { error });
    }
  }
  
  // Try fallback
  const fallbackAdapter = getAdapter(fallbackProvider);
  if (fallbackAdapter && !circuitBreaker.isOpen(fallbackProvider)) {
    try {
      const pool = await fallbackAdapter.getPool(chain, address);
      if (pool) {
        logService.info('PROVIDER', 'Used fallback provider: ' + fallbackProvider);
        return { pool, provider: fallbackProvider, usedFallback: true };
      }
    } catch (error) {
      logService.warn('PROVIDER', 'Fallback provider failed: ' + fallbackProvider, { error });
    }
  }
  
  return { pool: null, provider: '', usedFallback: false };
}

// Get pools with fallback
export async function getPoolsWithFallback(
  chain: string,
  limit: number,
  primaryProvider = 'defillama',
  fallbackProvider = 'geckoterminal'
): Promise<{ pools: Pool[]; provider: string; usedFallback: boolean }> {
  
  // Try primary
  const primaryAdapter = getAdapter(primaryProvider);
  if (primaryAdapter && !circuitBreaker.isOpen(primaryProvider)) {
    try {
      const pools = await primaryAdapter.getPools(chain, limit);
      if (pools.length > 0) {
        return { pools, provider: primaryProvider, usedFallback: false };
      }
    } catch (error) {
      logService.warn('PROVIDER', 'Primary provider failed: ' + primaryProvider, { error });
    }
  }
  
  // Try fallback
  const fallbackAdapter = getAdapter(fallbackProvider);
  if (fallbackAdapter && !circuitBreaker.isOpen(fallbackProvider)) {
    try {
      const pools = await fallbackAdapter.getPools(chain, limit);
      if (pools.length > 0) {
        logService.info('PROVIDER', 'Used fallback provider: ' + fallbackProvider);
        return { pools, provider: fallbackProvider, usedFallback: true };
      }
    } catch (error) {
      logService.warn('PROVIDER', 'Fallback provider failed: ' + fallbackProvider, { error });
    }
  }
  
  return { pools: [], provider: '', usedFallback: false };
}

// Get health status of all providers
export async function getAllProvidersHealth(): Promise<ProviderHealth[]> {
  const health: ProviderHealth[] = [];
  
  for (const [name, adapter] of Object.entries(adapters)) {
    const cbStatus = circuitBreaker.getStatus(name);
    let isHealthy = false;
    
    if (!cbStatus.isOpen) {
      try {
        isHealthy = await adapter.healthCheck();
      } catch {
        isHealthy = false;
      }
    }
    
    health.push({
      name,
      isHealthy,
      isCircuitOpen: cbStatus.isOpen,
      consecutiveFailures: cbStatus.failures,
    });
  }
  
  return health;
}

// Consensus: get data from multiple sources and validate
export async function getPoolWithConsensus(
  chain: string,
  address: string
): Promise<{ pool: Pool | null; confidence: number; sources: string[] }> {
  const results: { pool: Pool; provider: string }[] = [];
  
  for (const [name, adapter] of Object.entries(adapters)) {
    if (circuitBreaker.isOpen(name)) continue;
    
    try {
      const pool = await adapter.getPool(chain, address);
      if (pool) {
        results.push({ pool, provider: name });
      }
    } catch {
      // Skip failed providers
    }
  }
  
  if (results.length === 0) {
    return { pool: null, confidence: 0, sources: [] };
  }
  
  // Use first result as base, calculate confidence based on agreement
  const basePool = results[0].pool;
  const sources = results.map(r => r.provider);
  
  // Calculate TVL divergence
  let maxDivergence = 0;
  for (let i = 1; i < results.length; i++) {
    const divergence = Math.abs(results[i].pool.tvl - basePool.tvl) / basePool.tvl * 100;
    maxDivergence = Math.max(maxDivergence, divergence);
  }
  
  // Confidence: 100% if 1 source, reduce by divergence if multiple
  const confidence = results.length === 1 
    ? 75  // Single source = moderate confidence
    : Math.max(0, 100 - maxDivergence);
  
  return { pool: basePool, confidence, sources };
}
