import axios from 'axios';
import { BaseAdapter } from './base.adapter.js';
import { Pool } from '../types/index.js';
import { fetchWithRetry } from '../services/retry.service.js';
import { cacheService } from '../services/cache.service.js';
import { config } from '../config/index.js';

const BASE_URL = 'https://api.dexscreener.com/latest';

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    h24: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    m5: { buys: number; sells: number };
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv: number;
  pairCreatedAt: number;
}

export class DexScreenerAdapter extends BaseAdapter {
  name = 'dexscreener';
  
  async getPools(chain: string, limit = 50): Promise<Pool[]> {
    const normalizedChain = this.normalizeChain(chain);
    const cacheKey = 'dexscreener:pools:' + normalizedChain;
    
    const result = await cacheService.getOrFetch(
      cacheKey,
      () => this.fetchPoolsBySearch(normalizedChain, limit),
      config.cache.price
    );
    
    return result.data;
  }
  
  private async fetchPoolsBySearch(chain: string, limit: number): Promise<Pool[]> {
    // DexScreener doesn't have a "list all pools" endpoint
    // We search for popular tokens on the chain
    const searchTerms = ['ETH', 'USDC', 'USDT', 'WBTC', 'ARB', 'OP'];
    const allPools: Pool[] = [];
    const seen = new Set<string>();
    
    for (const term of searchTerms) {
      try {
        const response = await fetchWithRetry(
          this.name,
          async () => {
            const res = await axios.get(BASE_URL + '/dex/search', {
              params: { q: term },
              timeout: 15000,
            });
            return res.data;
          }
        );
        
        const pairs: DexScreenerPair[] = response.pairs || [];
        
        for (const pair of pairs) {
          if (
            pair.chainId === chain &&
            !seen.has(pair.pairAddress) &&
            pair.liquidity?.usd >= config.thresholds.minLiquidity
          ) {
            seen.add(pair.pairAddress);
            allPools.push(this.mapToPool(pair));
          }
        }
      } catch {
        // Continue with other search terms
      }
      
      if (allPools.length >= limit) break;
    }
    
    return allPools
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, limit);
  }
  
  private mapToPool(data: DexScreenerPair): Pool {
    return {
      externalId: data.chainId + ':' + data.pairAddress,
      chain: this.normalizeChain(data.chainId),
      protocol: data.dexId,
      poolAddress: data.pairAddress,
      token0: {
        symbol: data.baseToken.symbol,
        address: data.baseToken.address,
        decimals: 18,
      },
      token1: {
        symbol: data.quoteToken.symbol,
        address: data.quoteToken.address,
        decimals: 18,
      },
      price: this.parseNumber(data.priceUsd),
      tvl: data.liquidity?.usd || 0,
      volume24h: data.volume?.h24 || 0,
    };
  }
  
  async getPool(chain: string, address: string): Promise<Pool | null> {
    const cacheKey = 'dexscreener:pool:' + chain + ':' + address;
    
    const result = await cacheService.getOrFetch(
      cacheKey,
      () => this.fetchPool(chain, address),
      config.cache.price
    );
    
    return result.data;
  }
  
  private async fetchPool(chain: string, address: string): Promise<Pool | null> {
    try {
      const response = await fetchWithRetry(
        this.name,
        async () => {
          const res = await axios.get(BASE_URL + '/dex/pairs/' + chain + '/' + address, {
            timeout: 15000,
          });
          return res.data;
        }
      );
      
      const pair: DexScreenerPair | undefined = response.pairs?.[0] || response.pair;
      
      if (!pair) return null;
      
      return this.mapToPool(pair);
    } catch {
      return null;
    }
  }
  
  // DexScreener specific: search by token
  async searchByToken(query: string): Promise<Pool[]> {
    try {
      const response = await fetchWithRetry(
        this.name,
        async () => {
          const res = await axios.get(BASE_URL + '/dex/search', {
            params: { q: query },
            timeout: 15000,
          });
          return res.data;
        }
      );
      
      const pairs: DexScreenerPair[] = response.pairs || [];
      
      return pairs
        .filter(p => p.liquidity?.usd >= config.thresholds.minLiquidity)
        .map(p => this.mapToPool(p));
    } catch {
      return [];
    }
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(BASE_URL + '/dex/search', {
        params: { q: 'ETH' },
        timeout: 10000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

export const dexScreenerAdapter = new DexScreenerAdapter();
