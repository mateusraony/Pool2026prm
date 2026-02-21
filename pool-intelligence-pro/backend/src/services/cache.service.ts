import NodeCache from 'node-cache';
import { config } from '../config/index.js';

class CacheService {
  private cache: NodeCache;
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
  };

  constructor() {
    this.cache = new NodeCache({
      stdTTL: config.cache.price,
      checkperiod: 120,
      useClones: false,
    });
  }

  get<T>(key: string): { data: T | null; isStale: boolean; age: number } {
    const value = this.cache.get<{ data: T; setAt: number; ttl: number }>(key);
    
    if (!value) {
      this.stats.misses++;
      return { data: null, isStale: false, age: 0 };
    }

    this.stats.hits++;
    const age = Date.now() - value.setAt;
    const isStale = age > value.ttl * 1000;

    return { data: value.data, isStale, age };
  }

  set<T>(key: string, data: T, ttlSeconds?: number): void {
    const ttl = ttlSeconds || config.cache.price;
    this.cache.set(key, { data, setAt: Date.now(), ttl }, ttl * 2);
    this.stats.sets++;
  }

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<{ data: T; fromCache: boolean; isStale: boolean }> {
    const cached = this.get<T>(key);

    if (cached.data && !cached.isStale) {
      return { data: cached.data, fromCache: true, isStale: false };
    }

    try {
      const freshData = await fetcher();
      this.set(key, freshData, ttlSeconds);
      return { data: freshData, fromCache: false, isStale: false };
    } catch (error) {
      if (cached.data) {
        return { data: cached.data, fromCache: true, isStale: true };
      }
      throw error;
    }
  }

  delete(key: string): void {
    this.cache.del(key);
  }

  deleteByPattern(pattern: string): number {
    const keys = this.cache.keys();
    const matchingKeys = keys.filter(k => k.includes(pattern));
    return this.cache.del(matchingKeys);
  }

  clear(): void {
    this.cache.flushAll();
  }

  getStats() {
    return {
      ...this.stats,
      keys: this.cache.keys().length,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
    };
  }

  static keys = {
    pool: (chain: string, address: string) => 'pool:' + chain + ':' + address,
    pools: (chain: string) => 'pools:' + chain,
    poolList: (chain: string, protocol?: string) => 'poolList:' + chain + ':' + (protocol || 'all'),
    price: (chain: string, token: string) => 'price:' + chain + ':' + token,
    score: (poolId: string) => 'score:' + poolId,
    recommendations: (mode: string) => 'recommendations:' + mode,
    providerHealth: (provider: string) => 'health:' + provider,
  };
}

export const cacheService = new CacheService();
