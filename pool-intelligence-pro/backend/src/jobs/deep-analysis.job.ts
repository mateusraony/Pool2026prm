// backend/src/jobs/deep-analysis.job.ts
import { priceHistoryService } from '../services/price-history.service.js';
import { computeDeepAnalysis } from '../services/technical-indicators.service.js';
import { cacheService } from '../services/cache.service.js';
import { memoryStore } from '../services/memory-store.service.js';
import { logService } from '../services/log.service.js';
import { getPrisma } from '../routes/prisma.js';

/**
 * Recalcula deep analysis para pools prioritárias (favoritos + top recomendações).
 * Roda a cada 10 minutos. Pre-popula o cache para que o endpoint sirva dados frescos.
 */
export async function runDeepAnalysisJob(): Promise<{ analyzed: number; errors: number }> {
  let analyzed = 0;
  let errors = 0;

  const poolIds = new Set<string>();

  // Favoritos do DB
  try {
    const prisma = getPrisma();
    const favorites = await prisma.favorite.findMany({ select: { poolId: true } });
    for (const f of favorites) poolIds.add(f.poolId);
  } catch (error: unknown) {
    logService.warn('SYSTEM', 'Could not fetch favorites from DB', { error });
  }

  // Top recomendações do MemoryStore
  const recs = memoryStore.getRecommendations();
  if (recs) {
    for (const r of recs.slice(0, 10)) {
      poolIds.add(r.pool.externalId);
    }
  }

  if (poolIds.size === 0) {
    logService.info('SYSTEM', 'No priority pools to analyze');
    return { analyzed: 0, errors: 0 };
  }

  for (const poolId of poolIds) {
    try {
      const parts = poolId.split('_');
      if (parts.length < 2) continue;
      const chain = parts[0];
      const address = parts.slice(1).join('_').toLowerCase();

      const cacheKey = `deep_analysis_${chain}_${address}_hour`;
      const cached = cacheService.get(cacheKey);
      if (cached.data && !cached.isStale) continue;

      const ohlcv = await priceHistoryService.getOhlcv(chain, address, 'hour', 168);
      if (!ohlcv || ohlcv.candles.length < 15) continue;

      const pool = memoryStore.getPool(poolId);
      const tvl = pool?.tvlUSD ?? 0;

      const analysis = computeDeepAnalysis(ohlcv.candles, tvl, chain, address, 'hour');
      if (analysis) {
        cacheService.set(cacheKey, analysis, 300);

        // Persist technical indicators to DB
        try {
          const prisma = getPrisma();
          const poolRecord = await prisma.poolCurrent.findFirst({
            where: { externalId: poolId },
            select: { id: true },
          });
          if (poolRecord) {
            await prisma.poolCurrent.update({
              where: { id: poolRecord.id },
              data: {
                rsi14: analysis.rsi?.value ?? null,
                macdLine: analysis.macd?.macdLine ?? null,
                macdSignal: analysis.macd?.signalLine ?? null,
                macdHistogram: analysis.macd?.histogram ?? null,
              },
            });
          }
        } catch (dbErr: unknown) {
          logService.warn('SYSTEM', 'Failed to persist deep analysis to DB', { poolId, error: String(dbErr) });
        }

        analyzed++;
      }
    } catch (error: unknown) {
      errors++;
      logService.warn('SYSTEM', 'Deep analysis failed for pool', { poolId, error });
    }
  }

  logService.info('SYSTEM', `Job completed: ${analyzed} analyzed, ${errors} errors, ${poolIds.size} total`);
  return { analyzed, errors };
}
