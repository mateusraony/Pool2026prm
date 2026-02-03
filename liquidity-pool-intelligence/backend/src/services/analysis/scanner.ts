import { Decimal } from 'decimal.js';
import { prisma } from '../../database/client.js';
import { config } from '../../config/index.js';
import { fetchTopPools, fetchPoolHistory } from '../graph/uniswap.js';
import { getTokenPrices } from '../price/cache.js';
import { PoolData, PoolFilters, RecommendedPool } from '../../types/pool.js';
import { calculateRanges } from './rangeCalculator.js';
import { log } from '../../utils/logger.js';

// ========================================
// SCANNER DE POOLS
// ========================================

// Escaneia pools de todas as redes configuradas
export async function scanAllPools(): Promise<PoolData[]> {
  const operation = log.startOperation('Scan all pools');
  const allPools: PoolData[] = [];

  // Busca configurações do usuário
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    throw new Error('Settings not found');
  }

  // Escaneia cada rede
  for (const network of settings.enabledNetworks) {
    if (!config.enabledNetworks.includes(network)) {
      log.warn(`Network ${network} enabled in settings but not configured`);
      continue;
    }

    try {
      log.info(`Scanning pools on ${network}...`);
      const pools = await fetchTopPools(network, 100);

      // Filtra pools por critérios básicos
      const filtered = pools.filter(pool =>
        pool.tvlUsd.gte(config.filters.minTvlUsd) &&
        settings.allowedPairTypes.includes(pool.pairType)
      );

      allPools.push(...filtered);
      log.info(`Found ${filtered.length} eligible pools on ${network}`);
    } catch (error) {
      log.error(`Failed to scan pools on ${network}`, { error });
    }
  }

  operation.success(`Scanned ${allPools.length} total pools`);
  return allPools;
}

// Enriquece pools com dados históricos e preços
export async function enrichPools(pools: PoolData[]): Promise<PoolData[]> {
  const operation = log.startOperation('Enrich pools', { count: pools.length });

  // Coleta todos os tokens únicos para buscar preços
  const tokens: { address: string; symbol: string }[] = [];
  for (const pool of pools) {
    tokens.push(
      { address: pool.token0.address, symbol: pool.token0.symbol },
      { address: pool.token1.address, symbol: pool.token1.symbol }
    );
  }

  // Busca preços
  const prices = await getTokenPrices(tokens);

  // Enriquece cada pool
  const enrichedPools: PoolData[] = [];

  for (const pool of pools) {
    try {
      // Adiciona preços dos tokens
      pool.token0.priceUsd = prices.get(pool.token0.address.toLowerCase());
      pool.token1.priceUsd = prices.get(pool.token1.address.toLowerCase());

      // Busca dados históricos
      const { volume7d, dayDatas } = await fetchPoolHistory(
        pool.network,
        pool.address,
        7
      );

      pool.volume7dUsd = volume7d;

      // Volume 24h
      if (dayDatas.length > 0) {
        pool.volume24hUsd = new Decimal(dayDatas[0].volumeUSD);
      }

      // Calcula APR estimado
      if (pool.tvlUsd.gt(0)) {
        const dailyFees = pool.volume24hUsd.mul(pool.feeTier).div(1000000);
        pool.aprEstimate = dailyFees.div(pool.tvlUsd).mul(365).mul(100);
      }

      enrichedPools.push(pool);
    } catch (error) {
      log.warn(`Failed to enrich pool ${pool.id}`, { error });
    }
  }

  operation.success(`Enriched ${enrichedPools.length} pools`);
  return enrichedPools;
}

// Filtra pools por critérios do usuário
export function filterPools(pools: PoolData[], filters: PoolFilters): PoolData[] {
  return pools.filter(pool => {
    // Filtro por rede
    if (filters.networks && !filters.networks.includes(pool.network)) {
      return false;
    }

    // Filtro por tipo de par
    if (filters.pairTypes && !filters.pairTypes.includes(pool.pairType)) {
      return false;
    }

    // Filtro por TVL mínimo
    if (filters.minTvlUsd && pool.tvlUsd.lt(filters.minTvlUsd)) {
      return false;
    }

    // Filtro por volume mínimo
    if (filters.minVolume24hUsd && pool.volume24hUsd.lt(filters.minVolume24hUsd)) {
      return false;
    }

    // Filtro por fee tiers
    if (filters.feeTiers && !filters.feeTiers.includes(pool.feeTier)) {
      return false;
    }

    return true;
  });
}

// Gera recomendações para pools
export async function generateRecommendations(
  pools: PoolData[]
): Promise<RecommendedPool[]> {
  const operation = log.startOperation('Generate recommendations', { count: pools.length });

  // Busca configurações
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (!settings) {
    throw new Error('Settings not found');
  }

  const recommendations: RecommendedPool[] = [];

  for (const pool of pools) {
    try {
      // Calcula ranges para a pool
      const ranges = await calculateRanges(pool, settings.riskProfile);

      if (ranges.length === 0) {
        continue;
      }

      // Encontra o melhor range (maior score)
      const bestRange = ranges.reduce((best, current) =>
        current.metrics.score > best.metrics.score ? current : best
      );

      // Gera warnings se necessário
      const warnings: string[] = [];

      if (pool.tvlUsd.lt(500000)) {
        warnings.push('TVL relativamente baixo - maior risco de slippage');
      }

      if (pool.pairType === 'altcoin_stable') {
        warnings.push('Par volátil - maior risco de IL');
      }

      if (bestRange.metrics.timeInRange7d.lt(70)) {
        warnings.push('Preço ficou fora do range com frequência');
      }

      recommendations.push({
        pool,
        ranges,
        bestRange,
        overallScore: bestRange.metrics.score,
        warnings,
      });
    } catch (error) {
      log.warn(`Failed to generate recommendation for pool ${pool.id}`, { error });
    }
  }

  // Ordena por score
  recommendations.sort((a, b) => b.overallScore - a.overallScore);

  operation.success(`Generated ${recommendations.length} recommendations`);
  return recommendations;
}

// Salva pools no banco de dados
export async function savePools(pools: PoolData[]): Promise<void> {
  const operation = log.startOperation('Save pools', { count: pools.length });

  for (const pool of pools) {
    try {
      await prisma.pool.upsert({
        where: { id: pool.id },
        update: {
          tvlUsd: pool.tvlUsd,
          volume24hUsd: pool.volume24hUsd,
          volume7dUsd: pool.volume7dUsd,
          currentPrice: pool.currentPrice,
          currentTick: pool.currentTick,
          aprEstimate: pool.aprEstimate,
          lastScannedAt: new Date(),
        },
        create: {
          id: pool.id,
          network: pool.network,
          dex: pool.dex,
          address: pool.address,
          token0Symbol: pool.token0.symbol,
          token1Symbol: pool.token1.symbol,
          token0Address: pool.token0.address,
          token0Decimals: pool.token0.decimals,
          token1Address: pool.token1.address,
          token1Decimals: pool.token1.decimals,
          feeTier: pool.feeTier,
          tvlUsd: pool.tvlUsd,
          volume24hUsd: pool.volume24hUsd,
          volume7dUsd: pool.volume7dUsd,
          currentPrice: pool.currentPrice,
          currentTick: pool.currentTick,
          aprEstimate: pool.aprEstimate,
          pairType: pool.pairType,
          lastScannedAt: new Date(),
        },
      });
    } catch (error) {
      log.warn(`Failed to save pool ${pool.id}`, { error });
    }
  }

  operation.success();
}

// Processo completo de scan
export async function runPoolScan(): Promise<RecommendedPool[]> {
  const operation = log.startOperation('Full pool scan');

  try {
    // 1. Escaneia pools
    const rawPools = await scanAllPools();

    // 2. Enriquece com dados históricos
    const enrichedPools = await enrichPools(rawPools);

    // 3. Filtra por volume mínimo
    const filteredPools = filterPools(enrichedPools, {
      minVolume24hUsd: config.filters.minVolume24hUsd,
    });

    // 4. Gera recomendações
    const recommendations = await generateRecommendations(filteredPools);

    // 5. Salva no banco
    await savePools(filteredPools);

    operation.success(`Scan complete: ${recommendations.length} recommendations`);
    return recommendations;
  } catch (error) {
    operation.fail(error);
    throw error;
  }
}
