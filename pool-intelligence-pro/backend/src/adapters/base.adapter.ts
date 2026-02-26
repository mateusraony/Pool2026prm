import { Pool, PoolSnapshot, ProviderAdapter } from '../types/index.js';

export abstract class BaseAdapter implements ProviderAdapter {
  abstract name: string;
  
  abstract getPools(chain: string, limit?: number): Promise<Pool[]>;
  abstract getPool(chain: string, address: string): Promise<Pool | null>;
  abstract healthCheck(): Promise<boolean>;
  
  // Optional methods with default implementations
  async getPoolHistory(chain: string, address: string, days: number): Promise<PoolSnapshot[]> {
    return [];
  }
  
  async getPrice(chain: string, tokenAddress: string): Promise<number | null> {
    return null;
  }
  
  // Helper to normalize chain names
  protected normalizeChain(chain: string): string {
    const chainMap: Record<string, string> = {
      'eth': 'ethereum',
      'mainnet': 'ethereum',
      'arb': 'arbitrum',
      'arbitrum-one': 'arbitrum',
      'matic': 'polygon',
      'op': 'optimism',
      'bsc': 'bsc',
      'bnb': 'bsc',
    };
    return chainMap[chain.toLowerCase()] || chain.toLowerCase();
  }
  
  // Helper to parse numbers safely
  protected parseNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }
}
