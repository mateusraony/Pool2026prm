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
    
    return filtered.map(p => this.mapToPool(p));
  }
  
  private mapToPool(data: DefiLlamaPool): Pool {
    // Parse symbol (e.g., "WETH-USDC" or "ETH/USDC")
    const symbols = data.symbol.replace('/', '-').split('-');
    const token0Symbol = symbols[0] || 'UNKNOWN';
    const token1Symbol = symbols[1] || 'UNKNOWN';
    
    return {
      externalId: data.pool,
      chain: this.normalizeChain(data.chain),
      protocol: data.project,
      poolAddress: data.pool, // DefiLlama uses pool ID as address
      token0: {
        symbol: token0Symbol,
        address: data.underlyingTokens?.[0] || '',
        decimals: 18,
      },
      token1: {
        symbol: token1Symbol,
        address: data.underlyingTokens?.[1] || '',
        decimals: 18,
      },
      tvl: data.tvlUsd,
      volume24h: data.volumeUsd1d || 0,
      volume7d: data.volumeUsd7d,
      apr: data.apy || data.apyBase,
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
