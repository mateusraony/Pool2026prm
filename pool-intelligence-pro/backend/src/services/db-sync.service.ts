import { getPrisma } from '../routes/prisma.js';
import { logService } from './log.service.js';
import type { UnifiedPool, Score } from '../types/index.js';

class DbSyncService {
  /**
   * Upsert pools to PoolCurrent + create PoolSnapshot.
   * Fire-and-forget: never throws, logs errors.
   */
  async syncPools(pools: UnifiedPool[]): Promise<void> {
    const prisma = getPrisma();
    let synced = 0;

    for (const pool of pools) {
      try {
        // Upsert PoolCurrent
        await prisma.poolCurrent.upsert({
          where: { externalId: pool.id },
          create: {
            externalId: pool.id,
            chain: pool.chain || '',
            protocol: pool.protocol || 'unknown',
            poolAddress: pool.poolAddress || '',
            token0Symbol: pool.token0?.symbol || '',
            token0Address: pool.token0?.address || '',
            token0Decimals: pool.token0?.decimals || 18,
            token1Symbol: pool.token1?.symbol || '',
            token1Address: pool.token1?.address || '',
            token1Decimals: pool.token1?.decimals || 18,
            feeTier: pool.feeTier ?? null,
            price: pool.price ?? null,
            priceToken0Usd: pool.token0?.priceUsd ?? null,
            priceToken1Usd: pool.token1?.priceUsd ?? null,
            tvl: pool.tvlUSD || 0,
            volume24h: pool.volume24hUSD || 0,
            volume7d: 0,
            fees24h: pool.fees24hUSD || 0,
            fees7d: 0,
            primarySource: 'radar',
            lastUpdated: new Date(),
          },
          update: {
            price: pool.price ?? null,
            priceToken0Usd: pool.token0?.priceUsd ?? null,
            priceToken1Usd: pool.token1?.priceUsd ?? null,
            tvl: pool.tvlUSD || 0,
            volume24h: pool.volume24hUSD || 0,
            fees24h: pool.fees24hUSD || 0,
            volatility24h: pool.volatilityAnn ?? null,
            volatility7d: pool.volatilityAnn ?? null,
            priceChange24h: pool.priceChange24h ?? null,
            dataQuality: pool.healthScore != null && pool.healthScore > 0 ? 'GOOD' : 'STALE',
            lastUpdated: new Date(),
          },
        });

        // Create snapshot (time-series)
        const poolRecord = await prisma.poolCurrent.findUnique({
          where: { externalId: pool.id },
          select: { id: true },
        });

        if (poolRecord) {
          await prisma.poolSnapshot.create({
            data: {
              poolId: poolRecord.id,
              price: pool.price ?? null,
              tvl: pool.tvlUSD || 0,
              volume24h: pool.volume24hUSD || 0,
              fees24h: pool.fees24hUSD || 0,
              aprFee: pool.aprFee ?? null,
              volume1h: pool.volume1hUSD ?? null,
              fees1h: pool.fees1hUSD ?? null,
              aprAdjusted: pool.aprAdjusted ?? null,
              volatilityAnn: pool.volatilityAnn ?? null,
              healthScore: pool.healthScore ?? null,
            },
          });
        }

        synced++;
      } catch (error) {
        logService.warn('SYSTEM', `DB sync failed for pool ${pool.id}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (synced > 0) {
      logService.info('SYSTEM', `DB sync: ${synced}/${pools.length} pools persisted`);
    }
  }

  /**
   * Save scores to Score table (historical tracking).
   */
  async syncScores(entries: Array<{ poolId: string; score: Score }>): Promise<void> {
    const prisma = getPrisma();

    for (const { poolId, score } of entries) {
      try {
        const poolRecord = await prisma.poolCurrent.findUnique({
          where: { externalId: poolId },
          select: { id: true },
        });

        if (!poolRecord) continue;

        await prisma.score.create({
          data: {
            poolId: poolRecord.id,
            totalScore: score.total,
            healthScore: score.health,
            returnScore: score.return,
            riskScore: score.risk,
            healthBreakdown: score.breakdown.health as any,
            returnBreakdown: score.breakdown.return as any,
            riskBreakdown: score.breakdown.risk as any,
            recommendedMode: score.recommendedMode,
            isSuspect: score.isSuspect || false,
            suspectReason: score.suspectReason,
            calculatedAt: new Date(),
            dataTimestamp: new Date(),
          },
        });
      } catch (error) {
        logService.warn('SYSTEM', `Score sync failed for ${poolId}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Load pools from DB to hydrate MemoryStore on cold-start.
   * Returns UnifiedPool-like objects with enough data for display.
   */
  async loadPoolsFromDb(): Promise<UnifiedPool[]> {
    try {
      const prisma = getPrisma();
      const dbPools = await prisma.poolCurrent.findMany({
        where: {
          lastUpdated: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // last 24h only
          },
        },
        orderBy: { tvl: 'desc' },
        take: 500,
      });

      return dbPools.map(p => ({
        id: p.externalId,
        chain: p.chain,
        protocol: p.protocol,
        poolAddress: p.poolAddress,
        poolType: 'CL' as const,
        baseToken: p.token0Symbol,
        quoteToken: p.token1Symbol,
        token0: {
          symbol: p.token0Symbol,
          address: p.token0Address,
          decimals: p.token0Decimals,
          priceUsd: p.priceToken0Usd ?? undefined,
        },
        token1: {
          symbol: p.token1Symbol,
          address: p.token1Address,
          decimals: p.token1Decimals,
          priceUsd: p.priceToken1Usd ?? undefined,
        },
        feeTier: p.feeTier ?? 0,
        price: p.price ?? undefined,
        tvlUSD: p.tvl,
        tvl: p.tvl,
        volume5mUSD: null,
        volume1hUSD: null,
        volume24hUSD: p.volume24h,
        volume24h: p.volume24h,
        fees5mUSD: null,
        fees1hUSD: null,
        fees24hUSD: p.fees24h,
        fees24h: p.fees24h,
        aprFee: null,
        aprIncentive: 0,
        aprTotal: null,
        aprAdjusted: null,
        volatilityAnn: 0,
        priceChange24h: p.priceChange24h ?? undefined,
        ratio: 0,
        healthScore: 0,
        penaltyTotal: 1,
        bluechip: false,
        warnings: [],
        updatedAt: p.lastUpdated.toISOString(),
      })) as unknown as UnifiedPool[];
    } catch (error) {
      logService.warn('SYSTEM', 'Failed to load pools from DB', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Load latest scores from DB for cold-start.
   */
  async loadScoresFromDb(): Promise<Map<string, Score>> {
    const scores = new Map<string, Score>();
    try {
      const prisma = getPrisma();
      const dbScores = await prisma.score.findMany({
        where: {
          calculatedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { calculatedAt: 'desc' },
        take: 500,
        include: { pool: { select: { externalId: true } } },
      });

      // Keep only latest per pool
      for (const s of dbScores) {
        if (!scores.has(s.pool.externalId)) {
          scores.set(s.pool.externalId, {
            total: s.totalScore,
            health: s.healthScore,
            return: s.returnScore,
            risk: s.riskScore,
            breakdown: {
              health: s.healthBreakdown as any,
              return: s.returnBreakdown as any,
              risk: s.riskBreakdown as any,
            },
            recommendedMode: s.recommendedMode as any,
            isSuspect: s.isSuspect,
            suspectReason: s.suspectReason ?? undefined,
          });
        }
      }
    } catch (error) {
      logService.warn('SYSTEM', 'Failed to load scores from DB', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return scores;
  }

  /**
   * Cleanup old snapshots (keep last N days).
   * Run daily via cron.
   */
  async cleanupOldSnapshots(daysToKeep: number = 30): Promise<number> {
    try {
      const prisma = getPrisma();
      const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
      const result = await prisma.poolSnapshot.deleteMany({
        where: { timestamp: { lt: cutoff } },
      });
      logService.info('SYSTEM', `Cleaned ${result.count} old snapshots`);
      return result.count;
    } catch (error) {
      logService.warn('SYSTEM', 'Snapshot cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }
}

export const dbSyncService = new DbSyncService();
