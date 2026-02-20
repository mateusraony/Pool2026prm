import { Pool, ProviderAdapter, ProviderHealth } from '../types/index.js';
import { defiLlamaAdapter } from './defillama.adapter.js';
import { geckoTerminalAdapter } from './geckoterminal.adapter.js';
import { dexScreenerAdapter } from './dexscreener.adapter.js';
import { theGraphAdapter } from './thegraph.adapter.js';
import { circuitBreaker } from '../services/circuit-breaker.service.js';
import { logService } from '../services/log.service.js';
import { memoryStore } from '../services/memory-store.service.js';

// Export individual adapters
export { defiLlamaAdapter } from './defillama.adapter.js';
export { geckoTerminalAdapter } from './geckoterminal.adapter.js';
export { dexScreenerAdapter } from './dexscreener.adapter.js';
export { theGraphAdapter } from './thegraph.adapter.js';

// Registry of all adapters
const adapters: Record<string, ProviderAdapter> = {
  defillama: defiLlamaAdapter,
  geckoterminal: geckoTerminalAdapter,
  dexscreener: dexScreenerAdapter,
  thegraph: theGraphAdapter,
};

// Provedores que não afetam o status geral se falharem:
// - thegraph: requer API key (THEGRAPH_API_KEY)
// - geckoterminal: supplementary, rate-limited; main data comes from DefiLlama
const optionalProviders = new Set(['thegraph', 'geckoterminal']);

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

  // 0. Check MemoryStore first — avoids external API calls for pools already loaded by radar
  const memPool = memoryStore.getAllPools().find(p =>
    p.chain === chain && (p.poolAddress === address || p.id === address || p.id === `${chain}_${address}`)
  );
  if (memPool) {
    const pool: Pool = {
      externalId: memPool.id,
      chain: memPool.chain,
      protocol: memPool.protocol,
      poolAddress: memPool.poolAddress,
      token0: memPool.token0,
      token1: memPool.token1,
      feeTier: memPool.feeTier,
      price: memPool.price,
      tvl: memPool.tvlUSD,
      volume24h: memPool.volume24hUSD,
      fees24h: memPool.fees24hUSD ?? 0,
      apr: memPool.aprTotal ?? memPool.aprFee ?? 0,
    } as Pool;
    return { pool, provider: 'memory-store', usedFallback: false };
  }

  // Skip external providers for non-0x addresses (e.g. DefiLlama UUIDs) — they will always fail
  if (!address.startsWith('0x')) {
    // Try DefiLlama which can search by its own pool ID
    try {
      const pool = await defiLlamaAdapter.getPool(chain, address);
      if (pool) return { pool, provider: 'defillama', usedFallback: false };
    } catch { /* continue */ }
    return { pool: null, provider: '', usedFallback: false };
  }

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
    const isOptional = optionalProviders.has(name);
    let isHealthy = false;
    let note: string | undefined;

    // TheGraph: se não tem API key, nem tenta — sinaliza como "não configurado"
    if (name === 'thegraph' && !process.env.THEGRAPH_API_KEY) {
      health.push({
        name,
        isHealthy: false,
        isCircuitOpen: false,
        consecutiveFailures: 0,
        isOptional: true,
        note: 'THEGRAPH_API_KEY não configurada (opcional)',
      });
      continue;
    }

    if (!cbStatus.isOpen) {
      try {
        isHealthy = await adapter.healthCheck();
      } catch {
        isHealthy = false;
      }
    }

    // Add note for optional providers to clarify they don't affect system status
    if (isOptional && !isHealthy) {
      note = `Opcional — não afeta status geral`;
    }

    health.push({
      name,
      isHealthy,
      isCircuitOpen: cbStatus.isOpen,
      consecutiveFailures: cbStatus.failures,
      isOptional,
      note,
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
