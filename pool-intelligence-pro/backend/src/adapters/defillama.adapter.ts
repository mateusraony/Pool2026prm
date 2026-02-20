import axios from 'axios';
import { BaseAdapter } from './base.adapter.js';
import { Pool } from '../types/index.js';
import { fetchWithRetry } from '../services/retry.service.js';
import { cacheService } from '../services/cache.service.js';
import { config } from '../config/index.js';

const BASE_URL = 'https://yields.llama.fi';

interface DefiLlamaPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apyBase?: number;
  apyReward?: number;
  apy?: number;
  rewardTokens?: string[];
  underlyingTokens?: string[];
  poolMeta?: string;
  il7d?: number;
  apyBase7d?: number;
  volumeUsd1d?: number;
  volumeUsd7d?: number;
}

export class DefiLlamaAdapter extends BaseAdapter {
  name = 'defillama';
  
  async getPools(chain: string, limit = 100): Promise<Pool[]> {
    const cacheKey = 'defillama:pools:' + chain;
    
    const result = await cacheService.getOrFetch(
      cacheKey,
      () => this.fetchPools(chain, limit),
      config.cache.macro
    );
    
    return result.data;
  }
  
  private async fetchPools(chain: string, limit: number): Promise<Pool[]> {
    const normalizedChain = this.normalizeChain(chain);

    const response = await fetchWithRetry(
      this.name,
      async () => {
        const res = await axios.get(BASE_URL + '/pools', {
          timeout: 30000,
        });
        return res.data;
      }
    );

    const pools: DefiLlamaPool[] = response.data || response;

    // Filter by chain and minimum TVL
    const filtered = pools
      .filter(p =>
        p.chain.toLowerCase() === normalizedChain &&
        p.tvlUsd >= config.thresholds.minLiquidity
      )
      .sort((a, b) => b.tvlUsd - a.tvlUsd)
      .slice(0, limit);

    // Fetch real token prices from DefiLlama coins API (batch)
    const priceMap = await this.fetchTokenPrices(normalizedChain, filtered);

    return filtered.map(p => this.mapToPool(p, priceMap));
  }

  /**
   * Batch-fetch real token prices from the DefiLlama coins API.
   * Returns Map<lowercaseAddress, priceUSD>
   */
  private async fetchTokenPrices(
    chain: string,
    pools: DefiLlamaPool[]
  ): Promise<Map<string, number>> {
    const addresses = new Set<string>();
    for (const p of pools) {
      if (p.underlyingTokens) {
        for (const addr of p.underlyingTokens) {
          if (addr.startsWith('0x')) addresses.add(addr.toLowerCase());
        }
      }
    }

    if (addresses.size === 0) return new Map();

    // coins.llama.fi accepts {chain}:{address} format, max ~100 per request
    const addrList = Array.from(addresses).slice(0, 80);
    const coins = addrList.map(a => `${chain}:${a}`).join(',');

    try {
      const res = await axios.get(
        `https://coins.llama.fi/prices/current/${coins}`,
        { timeout: 15000 }
      );
      const prices = new Map<string, number>();
      for (const [key, val] of Object.entries(res.data?.coins || {})) {
        const addr = key.split(':')[1]?.toLowerCase();
        if (addr && (val as any).price) {
          prices.set(addr, (val as any).price);
        }
      }
      return prices;
    } catch {
      // Non-critical: just means we'll use fallback estimates
      return new Map();
    }
  }
  
  private mapToPool(data: DefiLlamaPool, priceMap: Map<string, number> = new Map()): Pool {
    // Parse symbol (e.g., "WETH-USDC" or "ETH/USDC")
    const symbols = data.symbol.replace('/', '-').split('-');
    const token0Symbol = symbols[0] || 'UNKNOWN';
    const token1Symbol = symbols[1] || 'UNKNOWN';

    // Extract pool address from DefiLlama pool ID
    // Formats: "uniswap-v3-ethereum-0xABC..." or "curve-ethereum-0xABC..." or just "0xABC..."
    let poolAddress = data.pool;
    const parts = data.pool.split('-');
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart.startsWith('0x') && lastPart.length >= 40) {
      poolAddress = lastPart;
    } else if (data.underlyingTokens?.[0]?.startsWith('0x')) {
      poolAddress = data.pool;
    }

    // Token addresses
    const token0Addr = data.underlyingTokens?.[0] || '';
    const token1Addr = data.underlyingTokens?.[1] || '';

    // Real prices from DefiLlama coins API
    const token0Price = priceMap.get(token0Addr.toLowerCase()) || 0;
    const token1Price = priceMap.get(token1Addr.toLowerCase()) || 0;

    // Pool price: prefer token0 price from API; if both available, use token0/token1 ratio
    let price: number;
    if (token0Price > 0 && token1Price > 0) {
      price = token0Price / token1Price; // relative price token0 in terms of token1
    } else if (token0Price > 0) {
      price = token0Price;
    } else if (token1Price > 0) {
      price = token1Price;
    } else {
      // Fallback: stablecoin pairs → 1, otherwise use TVL-based estimate
      const isStablePair = ['USDC', 'USDT', 'DAI', 'BUSD', 'FRAX'].some(
        s => token0Symbol.includes(s) || token1Symbol.includes(s)
      );
      price = isStablePair ? 1 : Math.max(1, data.tvlUsd / 100000);
    }

    // Detect feeTier from project name (e.g. "uniswap-v3" → likely CL pool)
    const feeTier = data.poolMeta?.includes('0.01%') ? 0.0001
      : data.poolMeta?.includes('0.05%') ? 0.0005
      : data.poolMeta?.includes('0.3%') ? 0.003
      : data.poolMeta?.includes('1%') ? 0.01
      : undefined;

    return {
      externalId: data.pool,
      chain: this.normalizeChain(data.chain),
      protocol: data.project,
      poolAddress,
      token0: {
        symbol: token0Symbol,
        address: token0Addr,
        decimals: 18,
        priceUsd: token0Price || undefined,
      },
      token1: {
        symbol: token1Symbol,
        address: token1Addr,
        decimals: 18,
        priceUsd: token1Price || undefined,
      },
      feeTier,
      price,
      tvl: data.tvlUsd,
      volume24h: data.volumeUsd1d || 0,
      volume7d: data.volumeUsd7d,
      apr: data.apyBase ?? data.apy, // Prefer base APY (fees only); fall back to total APY
    };
  }
  
  async getPool(chain: string, address: string): Promise<Pool | null> {
    const pools = await this.getPools(chain, 500);
    return pools.find(p => p.externalId === address || p.poolAddress === address) || null;
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(BASE_URL + '/pools', {
        timeout: 10000,
        params: { limit: 1 },
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
  
  // DefiLlama specific: Get yields/APY data
  async getYields(chain?: string): Promise<DefiLlamaPool[]> {
    const response = await fetchWithRetry(
      this.name,
      async () => {
        const res = await axios.get(BASE_URL + '/pools');
        return res.data;
      }
    );
    
    let pools: DefiLlamaPool[] = response.data || response;
    
    if (chain) {
      const normalizedChain = this.normalizeChain(chain);
      pools = pools.filter(p => p.chain.toLowerCase() === normalizedChain);
    }
    
    return pools;
  }
}

export const defiLlamaAdapter = new DefiLlamaAdapter();
