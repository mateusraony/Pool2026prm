import axios from 'axios';
import { BaseAdapter } from './base.adapter.js';
import { Pool } from '../types/index.js';
import { fetchWithRetry } from '../services/retry.service.js';
import { cacheService } from '../services/cache.service.js';
import { config } from '../config/index.js';
import { logService } from '../services/log.service.js';

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

    const mappedPools = filtered.map(p => this.mapToPool(p, priceMap));

    // Supplement missing volume data from GeckoTerminal (batch)
    await this.supplementVolumeData(normalizedChain, mappedPools);

    return mappedPools;
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
  
  /**
   * Supplement missing volume data for pools that have a 0x address.
   * Uses GeckoTerminal's batch endpoint to fetch volume in one call.
   * Falls back to APY-based estimation if GeckoTerminal is unavailable.
   */
  private async supplementVolumeData(chain: string, pools: Pool[]): Promise<void> {
    // Identify pools missing volume that have a real 0x address
    const needVolume = pools.filter(p => !p.volume24h && p.poolAddress.startsWith('0x'));
    if (needVolume.length === 0) return;

    // Map chain name to GeckoTerminal chain slug
    const geckoChainMap: Record<string, string> = {
      ethereum: 'eth', arbitrum: 'arbitrum', base: 'base',
      polygon: 'polygon_pos', optimism: 'optimism', bsc: 'bsc',
    };
    const geckoChain = geckoChainMap[chain] || chain;

    // GeckoTerminal multi_pools endpoint: up to 30 addresses per call
    const batches: Pool[][] = [];
    for (let i = 0; i < needVolume.length; i += 30) {
      batches.push(needVolume.slice(i, i + 30));
    }

    let enriched = 0;
    for (const batch of batches) {
      try {
        const addresses = batch.map(p => p.poolAddress).join(',');
        const res = await axios.get(
          `https://api.geckoterminal.com/api/v2/networks/${geckoChain}/pools/multi/${addresses}`,
          { timeout: 15000, headers: { Accept: 'application/json' } }
        );
        const geckoData: any[] = res.data?.data || [];

        for (const gp of geckoData) {
          const addr = gp.attributes?.address?.toLowerCase();
          if (!addr) continue;

          const vol24h = parseFloat(gp.attributes?.volume_usd?.h24) || 0;
          if (vol24h <= 0) continue;

          const match = batch.find(p => p.poolAddress.toLowerCase() === addr);
          if (match) {
            match.volume24h = vol24h;
            // Also estimate fees24h from volume if not already set
            if (!match.fees24h && match.feeTier) {
              match.fees24h = vol24h * match.feeTier;
            }
            enriched++;
          }
        }
      } catch (err) {
        // GeckoTerminal unavailable — fall back to APY-based estimation below
        logService.warn('PROVIDER', 'GeckoTerminal volume supplement failed', { chain, batchSize: batch.length });
      }
    }

    // Fallback: for pools still missing volume, estimate from APY when available
    // APY = (fees24h / tvl) * 365 * 100  →  fees24h = apy / 100 / 365 * tvl
    // volume24h = fees24h / feeTier
    for (const pool of pools) {
      if (pool.volume24h > 0) continue; // Already has volume
      if (!pool.apr || pool.apr <= 0 || !pool.tvl || pool.tvl <= 0) continue;

      const fees24hEstimate = (pool.apr / 100 / 365) * pool.tvl;
      const feeTier = pool.feeTier || 0.003;
      const volumeEstimate = fees24hEstimate / feeTier;

      // Sanity check: volume should be reasonable (not 100x TVL)
      if (volumeEstimate > 0 && volumeEstimate < pool.tvl * 50) {
        pool.volume24h = Math.round(volumeEstimate);
        if (!pool.fees24h) {
          pool.fees24h = Math.round(fees24hEstimate * 100) / 100;
        }
        enriched++;
      }
    }

    if (enriched > 0) {
      logService.info('PROVIDER', `DefiLlama: enriched ${enriched} pools with volume data`, { chain });
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

    const volume24h = data.volumeUsd1d || 0;
    const volume7d = data.volumeUsd7d;
    const apr = data.apyBase ?? data.apy; // Prefer base APY (fees only); fall back to total APY
    const aprReward = data.apyReward ?? undefined; // Incentive/reward APR from protocol

    // Estimate fees24h when volume is available but fees aren't
    let fees24h: number | undefined;
    if (volume24h > 0 && feeTier) {
      fees24h = volume24h * feeTier;
    }

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
      volume24h,
      volume7d,
      fees24h,
      apr,
      aprReward,
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
