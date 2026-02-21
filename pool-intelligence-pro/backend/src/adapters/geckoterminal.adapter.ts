import axios from 'axios';
import { BaseAdapter } from './base.adapter.js';
import { Pool, PoolSnapshot } from '../types/index.js';
import { fetchWithRetry } from '../services/retry.service.js';
import { cacheService } from '../services/cache.service.js';
import { config } from '../config/index.js';
import { calcVolatilityAnn, PricePoint } from '../services/calc.service.js';

const BASE_URL = 'https://api.geckoterminal.com/api/v2';

// GeckoTerminal uses different chain identifiers
const CHAIN_MAP: Record<string, string> = {
  'ethereum': 'eth',
  'arbitrum': 'arbitrum',
  'base': 'base',
  'polygon': 'polygon_pos',
  'optimism': 'optimism',
  'bsc': 'bsc',
  'avalanche': 'avax',
};

interface GeckoPool {
  id: string;
  type: string;
  attributes: {
    name: string;
    address: string;
    base_token_price_usd: string;
    quote_token_price_usd: string;
    base_token_price_native_currency: string;
    quote_token_price_native_currency: string;
    pool_created_at: string;
    reserve_in_usd: string;
    fdv_usd: string;
    market_cap_usd: string;
    price_change_percentage: {
      h1: string;
      h24: string;
      h6: string;
      m5: string;
    };
    transactions: {
      h1: { buys: number; sells: number };
      h24: { buys: number; sells: number };
    };
    volume_usd: {
      h1: string;
      h24: string;
      h6: string;
      m5: string;
    };
  };
  relationships?: {
    base_token?: { data: { id: string } };
    quote_token?: { data: { id: string } };
    dex?: { data: { id: string } };
  };
}

interface GeckoToken {
  id: string;
  type: string;
  attributes: {
    name: string;
    symbol: string;
    address: string;
    decimals: number;
    price_usd: string;
    total_supply: string;
  };
}

export class GeckoTerminalAdapter extends BaseAdapter {
  name = 'geckoterminal';
  
  private getGeckoChain(chain: string): string {
    const normalized = this.normalizeChain(chain);
    return CHAIN_MAP[normalized] || normalized;
  }
  
  async getPools(chain: string, limit = 50): Promise<Pool[]> {
    const geckoChain = this.getGeckoChain(chain);
    const cacheKey = 'gecko:pools:' + geckoChain;
    
    const result = await cacheService.getOrFetch(
      cacheKey,
      () => this.fetchPools(geckoChain, limit),
      config.cache.price
    );
    
    return result.data;
  }
  
  private async fetchPools(geckoChain: string, limit: number): Promise<Pool[]> {
    const response = await fetchWithRetry(
      this.name,
      async () => {
        const res = await axios.get(
          BASE_URL + '/networks/' + geckoChain + '/trending_pools',
          {
            timeout: 15000,
            headers: { Accept: 'application/json' },
          }
        );
        return res.data;
      }
    );
    
    const pools: GeckoPool[] = response.data || [];
    const included: GeckoToken[] = response.included || [];
    
    // Create token map for quick lookup
    const tokenMap = new Map<string, GeckoToken>();
    for (const token of included) {
      tokenMap.set(token.id, token);
    }
    
    return pools
      .slice(0, limit)
      .map(p => this.mapToPool(p, geckoChain, tokenMap))
      .filter(p => p.tvl >= config.thresholds.minLiquidity);
  }
  
  private mapToPool(
    data: GeckoPool, 
    geckoChain: string,
    tokenMap: Map<string, GeckoToken>
  ): Pool {
    const attrs = data.attributes;
    
    // Get token info
    const baseTokenId = data.relationships?.base_token?.data?.id;
    const quoteTokenId = data.relationships?.quote_token?.data?.id;
    const baseToken = baseTokenId ? tokenMap.get(baseTokenId) : null;
    const quoteToken = quoteTokenId ? tokenMap.get(quoteTokenId) : null;
    
    // Parse name for symbols if tokens not found
    const nameParts = attrs.name.split('/').map(s => s.trim());
    
    return {
      externalId: data.id,
      chain: this.normalizeChain(geckoChain),
      protocol: data.relationships?.dex?.data?.id || 'unknown',
      poolAddress: attrs.address,
      token0: {
        symbol: baseToken?.attributes.symbol || nameParts[0] || 'UNKNOWN',
        address: baseToken?.attributes.address || '',
        decimals: baseToken?.attributes.decimals || 18,
        priceUsd: this.parseNumber(attrs.base_token_price_usd),
      },
      token1: {
        symbol: quoteToken?.attributes.symbol || nameParts[1] || 'UNKNOWN',
        address: quoteToken?.attributes.address || '',
        decimals: quoteToken?.attributes.decimals || 18,
        priceUsd: this.parseNumber(attrs.quote_token_price_usd),
      },
      price: this.parseNumber(attrs.base_token_price_usd),
      tvl: this.parseNumber(attrs.reserve_in_usd),
      volume24h: this.parseNumber(attrs.volume_usd?.h24),
    };
  }
  
  async getPool(chain: string, address: string): Promise<Pool | null> {
    const geckoChain = this.getGeckoChain(chain);
    const cacheKey = 'gecko:pool:' + geckoChain + ':' + address;
    
    const result = await cacheService.getOrFetch(
      cacheKey,
      () => this.fetchPool(geckoChain, address),
      config.cache.price
    );
    
    return result.data;
  }
  
  private async fetchPool(geckoChain: string, address: string): Promise<Pool | null> {
    try {
      const response = await fetchWithRetry(
        this.name,
        async () => {
          const res = await axios.get(
            BASE_URL + '/networks/' + geckoChain + '/pools/' + address,
            {
              timeout: 15000,
              headers: { Accept: 'application/json' },
            }
          );
          return res.data;
        }
      );
      
      const pool: GeckoPool = response.data;
      const included: GeckoToken[] = response.included || [];
      
      const tokenMap = new Map<string, GeckoToken>();
      for (const token of included) {
        tokenMap.set(token.id, token);
      }
      
      return this.mapToPool(pool, geckoChain, tokenMap);
    } catch {
      return null;
    }
  }

  /**
   * Fetch hourly OHLCV candles and compute annualized volatility.
   * Returns undefined if insufficient data.
   */
  async fetchVolatility(chain: string, address: string): Promise<number | undefined> {
    const geckoChain = this.getGeckoChain(chain);
    const cacheKey = `gecko:vol:${geckoChain}:${address}`;
    const cached = cacheService.get<number>(cacheKey);
    if (cached.data != null) return cached.data;

    try {
      const res = await axios.get(
        `${BASE_URL}/networks/${geckoChain}/pools/${address}/ohlcv/hour`,
        { params: { aggregate: 1, limit: 72 }, timeout: 15000 }
      );
      const ohlcv: number[][] = res.data?.data?.attributes?.ohlcv_list || [];
      if (ohlcv.length < 5) return undefined;

      const pricePoints: PricePoint[] = ohlcv
        .map(c => ({
          timestamp: new Date(c[0] * 1000),
          price: c[4], // close price
        }))
        .filter(p => p.price > 0);

      const result = calcVolatilityAnn(pricePoints, 'hourly');
      if (result.method === 'log_returns' && result.dataPoints >= 5) {
        cacheService.set(cacheKey, result.volAnn, 1800); // Cache 30min
        return result.volAnn;
      }
    } catch {
      // Non-critical — volatility is optional
    }
    return undefined;
  }

  async getPoolHistory(chain: string, address: string, days: number): Promise<PoolSnapshot[]> {
    const geckoChain = this.getGeckoChain(chain);
    
    try {
      const response = await fetchWithRetry(
        this.name,
        async () => {
          const res = await axios.get(
            BASE_URL + '/networks/' + geckoChain + '/pools/' + address + '/ohlcv/day',
            {
              params: { aggregate: 1, limit: days },
              timeout: 15000,
            }
          );
          return res.data;
        }
      );
      
      const ohlcv = response.data?.attributes?.ohlcv_list || [];
      
      return ohlcv.map((candle: number[]) => ({
        timestamp: new Date(candle[0] * 1000),
        price: candle[4], // close price
        tvl: 0, // not available in OHLCV
        volume24h: candle[5] || 0,
      }));
    } catch {
      return [];
    }
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      const response = await axios.get(BASE_URL + '/networks', {
        timeout: 10000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

export const geckoTerminalAdapter = new GeckoTerminalAdapter();
