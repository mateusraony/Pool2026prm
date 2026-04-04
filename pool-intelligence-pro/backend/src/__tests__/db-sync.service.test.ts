import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
const mockPrisma = {
  poolCurrent: {
    upsert: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue({ id: 'mock-uuid' }),
  },
  poolSnapshot: {
    create: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
  },
  score: {
    create: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockImplementation((args?: { include?: any }) => {
      // Return data with pool relation when include is used
      if (args?.include?.pool) {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    }),
  },
};

vi.mock('../routes/prisma.js', () => ({
  getPrisma: () => mockPrisma,
}));

vi.mock('../services/log.service.js', () => ({
  logService: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { dbSyncService } from '../services/db-sync.service.js';

describe('dbSyncService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('syncPools', () => {
    it('should upsert pools to PoolCurrent and create snapshots', async () => {
      mockPrisma.poolCurrent.findUnique.mockResolvedValue({ id: 'mock-uuid' });

      const pools = [{
        id: 'ethereum_0x123',
        chain: 'ethereum',
        protocol: 'uniswap_v3',
        poolAddress: '0x123',
        token0: { symbol: 'WETH', address: '0xa', decimals: 18, priceUsd: 1800 },
        token1: { symbol: 'USDC', address: '0xb', decimals: 6, priceUsd: 1 },
        feeTier: 0.003,
        price: 1800,
        tvlUSD: 5000000,
        volume24hUSD: 1200000,
        fees24hUSD: 3600,
        aprFee: 26.3,
      }];

      await dbSyncService.syncPools(pools as any);

      expect(mockPrisma.poolCurrent.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.poolSnapshot.create).toHaveBeenCalledTimes(1);

      // Verify correct field mappings
      const upsertCall = mockPrisma.poolCurrent.upsert.mock.calls[0][0];
      expect(upsertCall.create.price).toBe(1800);
      expect(upsertCall.create.primarySource).toBe('radar');
      expect(upsertCall.create.tvl).toBe(5000000);

      const snapshotCall = mockPrisma.poolSnapshot.create.mock.calls[0][0];
      expect(snapshotCall.data.price).toBe(1800);
      expect(snapshotCall.data.aprFee).toBe(26.3);
    });

    it('should not throw on DB errors (fire-and-forget)', async () => {
      mockPrisma.poolCurrent.upsert.mockRejectedValueOnce(new Error('DB down'));

      await expect(dbSyncService.syncPools([{ id: 'test' }] as any))
        .resolves.not.toThrow();
    });

    it('should skip snapshot if findUnique returns null', async () => {
      mockPrisma.poolCurrent.findUnique.mockResolvedValueOnce(null);

      await dbSyncService.syncPools([{
        id: 'ethereum_0x999',
        chain: 'ethereum',
        protocol: 'uniswap_v3',
        poolAddress: '0x999',
        token0: { symbol: 'A', address: '0x1', decimals: 18 },
        token1: { symbol: 'B', address: '0x2', decimals: 18 },
        tvlUSD: 100,
        volume24hUSD: 50,
      }] as any);

      expect(mockPrisma.poolCurrent.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.poolSnapshot.create).not.toHaveBeenCalled();
    });
  });

  describe('syncScores', () => {
    it('should create score records', async () => {
      mockPrisma.poolCurrent.findUnique.mockResolvedValue({ id: 'mock-uuid' });

      const scores = [{
        poolId: 'ethereum_0x123',
        score: {
          total: 75,
          health: 30,
          return: 25,
          risk: 20,
          breakdown: {
            health: { liquidityStability: 10, ageScore: 10, volumeConsistency: 10 },
            return: { volumeTvlRatio: 10, feeEfficiency: 10, aprEstimate: 5 },
            risk: { volatilityPenalty: 5, liquidityDropPenalty: 5, inconsistencyPenalty: 5, spreadPenalty: 5 },
          },
          recommendedMode: 'NORMAL',
          isSuspect: false,
        },
      }];

      await dbSyncService.syncScores(scores as any);

      expect(mockPrisma.score.create).toHaveBeenCalledTimes(1);
      const createCall = mockPrisma.score.create.mock.calls[0][0];
      expect(createCall.data.totalScore).toBe(75);
      expect(createCall.data.healthScore).toBe(30);
    });

    it('should skip if pool not found in DB', async () => {
      mockPrisma.poolCurrent.findUnique.mockResolvedValueOnce(null);

      await dbSyncService.syncScores([{
        poolId: 'unknown_pool',
        score: { total: 50, health: 20, return: 15, risk: 15, breakdown: { health: {}, return: {}, risk: {} }, recommendedMode: 'NORMAL', isSuspect: false },
      }] as any);

      expect(mockPrisma.score.create).not.toHaveBeenCalled();
    });
  });

  describe('loadPoolsFromDb', () => {
    it('should return pools from database', async () => {
      mockPrisma.poolCurrent.findMany.mockResolvedValueOnce([{
        externalId: 'ethereum_0x123',
        chain: 'ethereum',
        protocol: 'uniswap_v3',
        poolAddress: '0x123',
        token0Symbol: 'WETH',
        token0Address: '0xa',
        token0Decimals: 18,
        token1Symbol: 'USDC',
        token1Address: '0xb',
        token1Decimals: 6,
        feeTier: 0.003,
        price: 1800,
        priceToken0Usd: 1800,
        priceToken1Usd: 1,
        tvl: 5000000,
        volume24h: 1200000,
        fees24h: 3600,
        priceChange24h: 2.5,
        lastUpdated: new Date(),
      }]);

      const pools = await dbSyncService.loadPoolsFromDb();
      expect(pools.length).toBe(1);
      expect(pools[0].id).toBe('ethereum_0x123');
      expect(pools[0].chain).toBe('ethereum');
      expect(pools[0].tvlUSD).toBe(5000000);
    });

    it('should return empty array on DB error', async () => {
      mockPrisma.poolCurrent.findMany.mockRejectedValueOnce(new Error('DB down'));
      const pools = await dbSyncService.loadPoolsFromDb();
      expect(pools).toEqual([]);
    });
  });

  describe('loadScoresFromDb', () => {
    it('should return scores map from database', async () => {
      mockPrisma.score.findMany.mockResolvedValueOnce([{
        totalScore: 75,
        healthScore: 30,
        returnScore: 25,
        riskScore: 20,
        healthBreakdown: { liquidityStability: 10, ageScore: 10, volumeConsistency: 10 },
        returnBreakdown: { volumeTvlRatio: 10, feeEfficiency: 10, aprEstimate: 5 },
        riskBreakdown: { volatilityPenalty: 5, liquidityDropPenalty: 5, inconsistencyPenalty: 5, spreadPenalty: 5 },
        recommendedMode: 'NORMAL',
        isSuspect: false,
        suspectReason: null,
        pool: { externalId: 'ethereum_0x123' },
      }]);

      const scores = await dbSyncService.loadScoresFromDb();
      expect(scores.size).toBe(1);
      expect(scores.get('ethereum_0x123')?.total).toBe(75);
    });

    it('should return empty map on DB error', async () => {
      mockPrisma.score.findMany.mockRejectedValueOnce(new Error('DB down'));
      const scores = await dbSyncService.loadScoresFromDb();
      expect(scores.size).toBe(0);
    });
  });

  describe('cleanupOldSnapshots', () => {
    it('should delete old snapshots and return count', async () => {
      mockPrisma.poolSnapshot.deleteMany.mockResolvedValueOnce({ count: 42 });
      const count = await dbSyncService.cleanupOldSnapshots(30);
      expect(count).toBe(42);
      expect(mockPrisma.poolSnapshot.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('should return 0 on error', async () => {
      mockPrisma.poolSnapshot.deleteMany.mockRejectedValueOnce(new Error('fail'));
      const count = await dbSyncService.cleanupOldSnapshots(30);
      expect(count).toBe(0);
    });
  });
});
