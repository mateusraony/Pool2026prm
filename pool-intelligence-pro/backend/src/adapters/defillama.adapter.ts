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

    // Extract pool address from DefiLlama pool ID
    // Formats: "uniswap-v3-ethereum-0xABC..." or "curve-ethereum-0xABC..." or just "0xABC..."
    let poolAddress = data.pool;
    const parts = data.pool.split('-');
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart.startsWith('0x') && lastPart.length >= 40) {
      poolAddress = lastPart;
    } else if (data.underlyingTokens?.[0]?.startsWith('0x')) {
      // Fallback: use first underlying token as pool reference
      poolAddress = data.pool; // Keep full ID if no clear address
    }

    // Estimate price based on TVL and typical pool composition
    // For stablecoin pairs, price ~= 1
    // For ETH pairs, estimate based on TVL / typical ETH amount
    let estimatedPrice = 1;
    const isStablePair = ['USDC', 'USDT', 'DAI', 'BUSD', 'FRAX'].some(
      s => token0Symbol.includes(s) || token1Symbol.includes(s)
    );
    if (!isStablePair && data.tvlUsd > 0) {
      // Rough estimate: assume 50% of TVL is token0
      // For ETH-like tokens, estimate ~$2500
      if (['ETH', 'WETH', 'stETH', 'wstETH'].some(s => token0Symbol.includes(s))) {
        estimatedPrice = 2500;
      } else if (['BTC', 'WBTC', 'cbBTC'].some(s => token0Symbol.includes(s))) {
        estimatedPrice = 45000;
      } else {
        // Generic estimate from TVL
        estimatedPrice = Math.max(1, data.tvlUsd / 100000);
      }
    }

    return {
      externalId: data.pool,
      chain: this.normalizeChain(data.chain),
      protocol: data.project,
      poolAddress, // Extracted address or full pool ID
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
      price: estimatedPrice,
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
