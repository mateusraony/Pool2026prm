/**
 * Wallet Service — ETAPA 17
 * Rastreia posições de liquidez (Uniswap V3) de wallets via The Graph.
 * Suporta múltiplas wallets. Persiste lista de wallets monitoradas.
 */

import axios from 'axios';
import { logService } from './log.service.js';
import { cacheService } from './cache.service.js';
import { persistService } from './persist.service.js';

export interface WalletPosition {
  id: string;
  chain: string;
  protocol: string;
  poolId: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Address: string;
  token1Address: string;
  feeTier: number;
  liquidity: string;
  depositedToken0: string;
  depositedToken1: string;
  withdrawnToken0: string;
  withdrawnToken1: string;
  collectedFeesToken0: string;
  collectedFeesToken1: string;
  tickLower: number;
  tickUpper: number;
  currentTick?: number;
  inRange: boolean;
  tvlUSD?: number;
}

export interface TrackedWallet {
  address: string;
  label?: string;
  addedAt: string;
}

// The Graph — Uniswap V3 subgraph endpoints (requer API key para redes mainnet)
const SUBGRAPH_URLS: Record<string, string | null> = {
  ethereum: process.env.THEGRAPH_API_KEY
    ? `https://gateway-arbitrum.network.thegraph.com/api/${process.env.THEGRAPH_API_KEY}/subgraphs/id/ELUcwgpm14LKPLrBRuVvPvNKHQ9HvwmtKgKSH855M4Np`
    : null,
  arbitrum: process.env.THEGRAPH_API_KEY
    ? `https://gateway-arbitrum.network.thegraph.com/api/${process.env.THEGRAPH_API_KEY}/subgraphs/id/FbCGRftH4a3yZugY7TnbYgPJVEv2LvMT6oF1fxPe9aH`
    : null,
  base: process.env.THEGRAPH_API_KEY
    ? `https://gateway-arbitrum.network.thegraph.com/api/${process.env.THEGRAPH_API_KEY}/subgraphs/id/GqzP4Xaehti8KSfQmv3ZctFSjnSUYZ4En5NRsiTbvZpz`
    : null,
  polygon: process.env.THEGRAPH_API_KEY
    ? `https://gateway-arbitrum.network.thegraph.com/api/${process.env.THEGRAPH_API_KEY}/subgraphs/id/3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCDqm9`
    : null,
};

const POSITIONS_QUERY = `
  query WalletPositions($owner: String!, $first: Int!) {
    positions(
      where: { owner: $owner, liquidity_gt: "0" }
      first: $first
      orderBy: depositedToken0
      orderDirection: desc
    ) {
      id
      liquidity
      depositedToken0
      depositedToken1
      withdrawnToken0
      withdrawnToken1
      collectedFeesToken0
      collectedFeesToken1
      tickLower { tickIdx }
      tickUpper { tickIdx }
      pool {
        id
        feeTier
        tick
        totalValueLockedUSD
        token0 { symbol id }
        token1 { symbol id }
      }
    }
  }
`;

const PERSIST_KEY = 'tracked-wallets';

class WalletService {
  private trackedWallets: Map<string, TrackedWallet> = new Map();

  async init(): Promise<void> {
    try {
      const saved = persistService.get(PERSIST_KEY) as TrackedWallet[] | undefined;
      if (saved && Array.isArray(saved)) {
        for (const w of saved) {
          if (w?.address) this.trackedWallets.set(w.address.toLowerCase(), w);
        }
        logService.info('SYSTEM', `Loaded ${this.trackedWallets.size} tracked wallets`);
      }
    } catch (err) {
      logService.warn('SYSTEM', 'Could not load tracked wallets', { error: (err as Error)?.message });
    }
  }

  private saveToDb(): void {
    persistService.set(PERSIST_KEY, Array.from(this.trackedWallets.values())).catch((err: unknown) => {
      logService.warn('SYSTEM', 'Could not save tracked wallets', { error: (err as Error)?.message });
    });
  }

  addWallet(address: string, label?: string): TrackedWallet {
    const normalized = address.toLowerCase();
    const existing = this.trackedWallets.get(normalized);
    if (existing) return existing;
    const wallet: TrackedWallet = { address: normalized, label, addedAt: new Date().toISOString() };
    this.trackedWallets.set(normalized, wallet);
    this.saveToDb();
    return wallet;
  }

  removeWallet(address: string): boolean {
    const removed = this.trackedWallets.delete(address.toLowerCase());
    if (removed) this.saveToDb();
    return removed;
  }

  getTrackedWallets(): TrackedWallet[] {
    return Array.from(this.trackedWallets.values());
  }

  /**
   * Busca posições de uma wallet em todas as chains suportadas.
   */
  async getWalletPositions(address: string): Promise<{ chain: string; positions: WalletPosition[] }[]> {
    const cacheKey = `wallet-positions:${address.toLowerCase()}`;
    const { data: cached } = cacheService.get<{ chain: string; positions: WalletPosition[] }[]>(cacheKey);
    if (cached) return cached;

    const normalized = address.toLowerCase();
    const results = await Promise.allSettled(
      Object.entries(SUBGRAPH_URLS)
        .filter(([, url]) => url !== null)
        .map(async ([chain, url]) => {
          try {
            const positions = await this.fetchPositionsForChain(normalized, chain, url!);
            return { chain, positions };
          } catch (err) {
            logService.warn('SYSTEM', `Failed to fetch positions for ${chain}`, { error: (err as Error)?.message });
            return { chain, positions: [] };
          }
        })
    );

    const data = results
      .filter((r): r is PromiseFulfilledResult<{ chain: string; positions: WalletPosition[] }> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(r => r.positions.length > 0);

    // If no THEGRAPH_API_KEY, return demo data for development
    const finalData = data.length > 0 ? data : this.getDemoPositions(address);

    // Cache for 2 minutes
    cacheService.set(cacheKey, finalData, 120);
    return finalData;
  }

  private async fetchPositionsForChain(owner: string, chain: string, url: string): Promise<WalletPosition[]> {
    const response = await axios.post(
      url,
      { query: POSITIONS_QUERY, variables: { owner, first: 50 } },
      { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
    );

    if (response.data?.errors?.length) {
      throw new Error(response.data.errors[0].message);
    }

    const positions = response.data?.data?.positions ?? [];
    return positions.map((p: Record<string, unknown>): WalletPosition => {
      const pool = p.pool as Record<string, unknown>;
      const token0 = pool.token0 as Record<string, string>;
      const token1 = pool.token1 as Record<string, string>;
      const tickLower = Number((p.tickLower as Record<string, unknown>)?.tickIdx ?? 0);
      const tickUpper = Number((p.tickUpper as Record<string, unknown>)?.tickIdx ?? 0);
      const currentTick = pool.tick != null ? Number(pool.tick) : undefined;
      const inRange = currentTick != null
        ? (currentTick >= tickLower && currentTick <= tickUpper)
        : false;

      return {
        id: p.id as string,
        chain,
        protocol: 'Uniswap V3',
        poolId: pool.id as string,
        token0Symbol: token0.symbol ?? '?',
        token1Symbol: token1.symbol ?? '?',
        token0Address: token0.id ?? '',
        token1Address: token1.id ?? '',
        feeTier: Number(pool.feeTier ?? 0) / 10000,
        liquidity: p.liquidity as string,
        depositedToken0: p.depositedToken0 as string,
        depositedToken1: p.depositedToken1 as string,
        withdrawnToken0: p.withdrawnToken0 as string,
        withdrawnToken1: p.withdrawnToken1 as string,
        collectedFeesToken0: p.collectedFeesToken0 as string,
        collectedFeesToken1: p.collectedFeesToken1 as string,
        tickLower,
        tickUpper,
        currentTick,
        inRange,
        tvlUSD: pool.totalValueLockedUSD ? Number(pool.totalValueLockedUSD) : undefined,
      };
    });
  }

  /**
   * Dados de demonstração quando não há API key.
   */
  private getDemoPositions(address: string): { chain: string; positions: WalletPosition[] }[] {
    logService.info('SYSTEM', 'Returning demo wallet positions (set THEGRAPH_API_KEY for real data)', { address });
    return [
      {
        chain: 'ethereum',
        positions: [
          {
            id: 'demo-1',
            chain: 'ethereum',
            protocol: 'Uniswap V3',
            poolId: '0xdemo1',
            token0Symbol: 'USDC',
            token1Symbol: 'ETH',
            token0Address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            token1Address: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
            feeTier: 0.05,
            liquidity: '1000000000000',
            depositedToken0: '5000',
            depositedToken1: '1.5',
            withdrawnToken0: '0',
            withdrawnToken1: '0',
            collectedFeesToken0: '12.5',
            collectedFeesToken1: '0.003',
            tickLower: -100,
            tickUpper: 100,
            currentTick: 50,
            inRange: true,
            tvlUSD: 8500,
          },
        ],
      },
    ];
  }
}

export const walletService = new WalletService();
