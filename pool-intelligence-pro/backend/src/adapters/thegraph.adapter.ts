/**
 * The Graph / Uniswap V3 Adapter
 * Fetches real pool data via GraphQL subgraphs
 * Falls back gracefully if no API key or quota exceeded
 */

import axios from 'axios';
import { Pool, PoolSnapshot, ProviderAdapter } from '../types/index.js';
import { logService } from '../services/log.service.js';
import { cacheService } from '../services/cache.service.js';
import { calcService, PoolType } from '../services/calc.service.js';

// ============================================================
// SUBGRAPH ENDPOINTS
// ============================================================

const SUBGRAPH_ENDPOINTS: Record<string, string> = {
  ethereum: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
  arbitrum: 'https://api.thegraph.com/subgraphs/name/ianlapham/arbitrum-minimal',
  base: 'https://api.thegraph.com/subgraphs/name/real-wagmi/wagmi-v2-base',
  polygon: 'https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-polygon',
  optimism: 'https://api.thegraph.com/subgraphs/name/ianlapham/optimism-post-regenesis',
};

// If THEGRAPH_API_KEY is set, use the decentralized network
// Without API key → return null (hosted service was removed in 2024)
function getEndpoint(chain: string): string | null {
  const apiKey = process.env.THEGRAPH_API_KEY;
  if (!apiKey) return null; // Hosted service removed — API key required

  // Uniswap V3 subgraph IDs on decentralized network
  const subgraphIds: Record<string, string> = {
    ethereum: 'ELUcwgpm14LKPLrBRuVvPvNKHQ9HvwmtKgKSH855M4Np',
    arbitrum: 'FbCGRftH4a3yZugY7TnbYgPJVEv2LvMT6oF1fxPe9aH',
    base: 'GqzP4Xaehti8KSfQmv3ZctFSjnSUYZ4En5NRsiTbvZpz',
    polygon: '3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCDqm9',
  };
  const id = subgraphIds[chain];
  if (id) {
    return `https://gateway-arbitrum.network.thegraph.com/api/${apiKey}/subgraphs/id/${id}`;
  }
  return null;
}

// ============================================================
// GRAPHQL QUERIES
// ============================================================

const TOP_POOLS_QUERY = `
  query TopPools($first: Int!, $skip: Int!, $minTVL: BigDecimal!) {
    pools(
      first: $first
      skip: $skip
      orderBy: totalValueLockedUSD
      orderDirection: desc
      where: { totalValueLockedUSD_gt: $minTVL }
    ) {
      id
      token0 { id symbol name decimals }
      token1 { id symbol name decimals }
      feeTier
      liquidity
      sqrtPrice
      tick
      tickSpacing
      totalValueLockedUSD
      volumeUSD
      feesUSD
      token0Price
      token1Price
      poolHourData(first: 25, orderBy: periodStartUnix, orderDirection: desc) {
        periodStartUnix
        tvlUSD
        volumeUSD
        feesUSD
        open
        close
        high
        low
      }
    }
  }
`;

const POOL_DETAIL_QUERY = `
  query PoolDetail($poolId: ID!) {
    pool(id: $poolId) {
      id
      token0 { id symbol name decimals }
      token1 { id symbol name decimals }
      feeTier
      liquidity
      sqrtPrice
      tick
      tickSpacing
      totalValueLockedUSD
      volumeUSD
      feesUSD
      token0Price
      token1Price
      poolHourData(first: 168, orderBy: periodStartUnix, orderDirection: desc) {
        periodStartUnix
        tvlUSD
        volumeUSD
        feesUSD
        open
        close
      }
    }
  }
`;

// ============================================================
// TRANSFORMER
// ============================================================

interface GraphQLPool {
  id: string;
  token0: { id: string; symbol: string; name: string; decimals: string };
  token1: { id: string; symbol: string; name: string; decimals: string };
  feeTier: string;
  totalValueLockedUSD: string;
  volumeUSD: string;
  feesUSD: string;
  token0Price: string;
  token1Price: string;
  tickSpacing?: string;
  poolHourData?: Array<{
    periodStartUnix: string;
    tvlUSD: string;
    volumeUSD: string;
    feesUSD: string;
    open: string;
    close: string;
    high?: string;
    low?: string;
  }>;
}

function transformPool(raw: GraphQLPool, chain: string): Pool {
  const feeTier = parseInt(raw.feeTier) / 1e6; // basis points to decimal fraction
  const tvl = parseFloat(raw.totalValueLockedUSD);
  const price = parseFloat(raw.token0Price) || 0;

  // Compute volume and fees from hourly data if available
  let volume1h = 0;
  let fees1h = 0;
  let volume24h = 0;
  let fees24h = 0;
  let volume5m: number | undefined;
  let fees5m: number | undefined;

  if (raw.poolHourData && raw.poolHourData.length > 0) {
    const latest = raw.poolHourData[0];
    volume1h = parseFloat(latest.volumeUSD) || 0;
    fees1h = parseFloat(latest.feesUSD) || 0;

    // 24h: sum last 24 hourly buckets
    const last24 = raw.poolHourData.slice(0, 24);
    volume24h = last24.reduce((s, h) => s + parseFloat(h.volumeUSD), 0);
    fees24h = last24.reduce((s, h) => s + parseFloat(h.feesUSD), 0);
  } else {
    volume24h = parseFloat(raw.volumeUSD) || 0;
    fees24h = parseFloat(raw.feesUSD) || 0;
  }

  const poolType: PoolType = calcService.inferPoolType({
    token0Symbol: raw.token0.symbol,
    token1Symbol: raw.token1.symbol,
    feeTier,
  });

  const pool: Pool & {
    volume1h?: number; fees1h?: number; volume5m?: number; fees5m?: number;
    poolType?: string; tickSpacing?: number; bluechip?: boolean;
  } = {
    externalId: `thegraph_${chain}_${raw.id}`,
    chain,
    protocol: 'uniswap_v3',
    poolAddress: raw.id.toLowerCase(),
    token0: {
      symbol: raw.token0.symbol,
      address: raw.token0.id.toLowerCase(),
      decimals: parseInt(raw.token0.decimals) || 18,
    },
    token1: {
      symbol: raw.token1.symbol,
      address: raw.token1.id.toLowerCase(),
      decimals: parseInt(raw.token1.decimals) || 18,
    },
    feeTier,
    price,
    tvl,
    volume24h,
    fees24h,
    volume1h,
    fees1h,
    volume5m,
    fees5m,
    poolType,
    tickSpacing: raw.tickSpacing ? parseInt(raw.tickSpacing) : undefined,
    bluechip: calcService.isBluechip(raw.token0.symbol, raw.token1.symbol),
  };

  return pool;
}

function transformHistory(raw: GraphQLPool): PoolSnapshot[] {
  if (!raw.poolHourData) return [];
  return raw.poolHourData.map(h => ({
    timestamp: new Date(parseInt(h.periodStartUnix) * 1000),
    price: parseFloat(h.close) || parseFloat(h.open) || undefined,
    tvl: parseFloat(h.tvlUSD) || 0,
    volume24h: parseFloat(h.volumeUSD) || 0,
    fees24h: parseFloat(h.feesUSD) || undefined,
  }));
}

// ============================================================
// ADAPTER CLASS
// ============================================================

class TheGraphAdapter implements ProviderAdapter {
  name = 'thegraph';
  private timeout = 15000;
  private maxRetries = 2;

  private async query<T>(endpoint: string, query: string, variables: Record<string, unknown>): Promise<T | null> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await axios.post(
          endpoint,
          { query, variables },
          {
            timeout: this.timeout,
            headers: { 'Content-Type': 'application/json' },
          }
        );

        if (response.data?.errors) {
          const errMsg = response.data.errors[0]?.message || 'GraphQL error';
          logService.warn('PROVIDER', `[TheGraph] GraphQL error: ${errMsg}`);
          if (errMsg.includes('limit') || errMsg.includes('quota')) {
            return null; // Rate limited, don't retry
          }
        }

        return response.data?.data as T;
      } catch (err: unknown) {
        const error = err as { code?: string; response?: { status: number } };
        if (attempt === this.maxRetries) {
          logService.warn('PROVIDER', `[TheGraph] Query failed after ${this.maxRetries} retries`, { error: String(err) });
          return null;
        }
        // Exponential backoff: 250ms, 1s
        const delay = 250 * Math.pow(4, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    return null;
  }

  async getPools(chain: string, limit = 50): Promise<Pool[]> {
    const endpoint = getEndpoint(chain);
    if (!endpoint) {
      logService.info('PROVIDER', `[TheGraph] No endpoint for chain: ${chain}`);
      return [];
    }

    const cacheKey = `thegraph_pools_${chain}_${limit}`;
    const { data: cached } = cacheService.get<Pool[]>(cacheKey);
    if (cached) return cached;

    const minTVL = 50000; // $50k minimum

    const data = await this.query<{ pools: GraphQLPool[] }>(
      endpoint,
      TOP_POOLS_QUERY,
      { first: Math.min(limit, 100), skip: 0, minTVL: minTVL.toString() }
    );

    if (!data?.pools) return [];

    const pools = data.pools
      .filter(p => parseFloat(p.totalValueLockedUSD) > minTVL)
      .map(p => transformPool(p, chain));

    // Cache for 5 minutes
    cacheService.set(cacheKey, pools, 300);

    logService.info('PROVIDER', `[TheGraph] Fetched ${pools.length} pools for ${chain}`);
    return pools;
  }

  async getPool(chain: string, address: string): Promise<Pool | null> {
    const endpoint = getEndpoint(chain);
    if (!endpoint) return null;

    const cacheKey = `thegraph_pool_${chain}_${address}`;
    const { data: cached } = cacheService.get<Pool>(cacheKey);
    if (cached) return cached;

    const data = await this.query<{ pool: GraphQLPool | null }>(
      endpoint,
      POOL_DETAIL_QUERY,
      { poolId: address.toLowerCase() }
    );

    if (!data?.pool) return null;

    const pool = transformPool(data.pool, chain);
    cacheService.set(cacheKey, pool, 60);
    return pool;
  }

  async getPoolHistory(chain: string, address: string, _days: number): Promise<PoolSnapshot[]> {
    const endpoint = getEndpoint(chain);
    if (!endpoint) return [];

    const data = await this.query<{ pool: GraphQLPool | null }>(
      endpoint,
      POOL_DETAIL_QUERY,
      { poolId: address.toLowerCase() }
    );

    if (!data?.pool) return [];
    return transformHistory(data.pool);
  }

  async healthCheck(): Promise<boolean> {
    const endpoint = getEndpoint('ethereum');
    if (!endpoint) return false;

    try {
      const data = await this.query<{ pools: { id: string }[] }>(
        endpoint,
        `query { pools(first: 1) { id } }`,
        {}
      );
      return !!data?.pools;
    } catch {
      return false;
    }
  }
}

export const theGraphAdapter = new TheGraphAdapter();
