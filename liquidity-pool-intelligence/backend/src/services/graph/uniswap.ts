import { Decimal } from 'decimal.js';
import { executeQuery } from './client.js';
import {
  PoolsQueryResponse,
  PoolDayDatasResponse,
  TicksResponse,
  PositionsResponse,
  SwapsResponse,
} from './types.js';
import { PoolData, LiquidityTick, PricePoint } from '../../types/pool.js';
import { classifyPairType } from '../../config/networks.js';
import { log } from '../../utils/logger.js';
import { tickToPrice } from '../../utils/math.js';

// Query para buscar top pools por TVL
const POOLS_QUERY = `
  query GetPools($first: Int!, $skip: Int!, $orderBy: String!, $orderDirection: String!) {
    pools(
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
      where: { totalValueLockedUSD_gt: "10000" }
    ) {
      id
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
      feeTier
      liquidity
      sqrtPrice
      tick
      totalValueLockedUSD
      volumeUSD
      feesUSD
      token0Price
      token1Price
    }
  }
`;

// Query para dados históricos da pool
const POOL_DAY_DATAS_QUERY = `
  query GetPoolDayDatas($poolId: String!, $startTime: Int!, $first: Int!) {
    poolDayDatas(
      first: $first
      orderBy: date
      orderDirection: desc
      where: { pool: $poolId, date_gte: $startTime }
    ) {
      date
      volumeUSD
      tvlUSD
      feesUSD
      open
      high
      low
      close
    }
  }
`;

// Query para distribuição de liquidez (ticks)
const TICKS_QUERY = `
  query GetTicks($poolId: String!, $tickLower: Int!, $tickUpper: Int!) {
    ticks(
      first: 500
      where: { pool: $poolId, tickIdx_gte: $tickLower, tickIdx_lte: $tickUpper }
      orderBy: tickIdx
    ) {
      tickIdx
      liquidityNet
      liquidityGross
      price0
      price1
    }
  }
`;

// Query para posições de um owner
const POSITIONS_QUERY = `
  query GetPositions($owner: String!) {
    positions(where: { owner: $owner, liquidity_gt: "0" }) {
      id
      owner
      pool {
        id
        token0 {
          id
          symbol
          decimals
        }
        token1 {
          id
          symbol
          decimals
        }
        feeTier
      }
      tickLower {
        tickIdx
        price0
        price1
      }
      tickUpper {
        tickIdx
        price0
        price1
      }
      liquidity
      depositedToken0
      depositedToken1
      withdrawnToken0
      withdrawnToken1
      collectedFeesToken0
      collectedFeesToken1
    }
  }
`;

// Query para swaps recentes (para histórico de preço)
const SWAPS_QUERY = `
  query GetSwaps($poolId: String!, $first: Int!, $startTime: Int!) {
    swaps(
      first: $first
      orderBy: timestamp
      orderDirection: desc
      where: { pool: $poolId, timestamp_gte: $startTime }
    ) {
      timestamp
      amount0
      amount1
      amountUSD
      sqrtPriceX96
      tick
    }
  }
`;

// ========================================
// FUNÇÕES DE BUSCA
// ========================================

// Busca top pools de uma rede
export async function fetchTopPools(
  network: string,
  limit: number = 100
): Promise<PoolData[]> {
  const operation = log.startOperation('Fetch top pools', { network, limit });

  try {
    const response = await executeQuery<PoolsQueryResponse>(
      network,
      POOLS_QUERY,
      {
        first: limit,
        skip: 0,
        orderBy: 'totalValueLockedUSD',
        orderDirection: 'desc',
      }
    );

    const pools = response.pools.map(pool => {
      const decimals0 = parseInt(pool.token0.decimals);
      const decimals1 = parseInt(pool.token1.decimals);
      const currentTick = parseInt(pool.tick);

      return {
        id: `${network}_uniswap_v3_${pool.id}`,
        network,
        dex: 'uniswap_v3',
        address: pool.id,
        token0: {
          address: pool.token0.id,
          symbol: pool.token0.symbol,
          decimals: decimals0,
        },
        token1: {
          address: pool.token1.id,
          symbol: pool.token1.symbol,
          decimals: decimals1,
        },
        feeTier: parseInt(pool.feeTier),
        tvlUsd: new Decimal(pool.totalValueLockedUSD),
        volume24hUsd: new Decimal(0), // Será preenchido com dados diários
        volume7dUsd: new Decimal(0),
        currentPrice: tickToPrice(currentTick, decimals0, decimals1),
        currentTick,
        pairType: classifyPairType(pool.token0.id, pool.token1.id),
      };
    });

    operation.success(`Fetched ${pools.length} pools`);
    return pools;
  } catch (error) {
    operation.fail(error);
    throw error;
  }
}

// Busca dados históricos de uma pool (últimos N dias)
export async function fetchPoolHistory(
  network: string,
  poolAddress: string,
  days: number = 30
): Promise<{ dayDatas: PoolDayDatasResponse['poolDayDatas']; volume7d: Decimal }> {
  const startTime = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

  const response = await executeQuery<PoolDayDatasResponse>(
    network,
    POOL_DAY_DATAS_QUERY,
    {
      poolId: poolAddress.toLowerCase(),
      startTime,
      first: days,
    }
  );

  // Calcula volume dos últimos 7 dias
  const last7Days = response.poolDayDatas.slice(0, 7);
  const volume7d = last7Days.reduce(
    (sum, day) => sum.add(new Decimal(day.volumeUSD)),
    new Decimal(0)
  );

  return {
    dayDatas: response.poolDayDatas,
    volume7d,
  };
}

// Busca distribuição de liquidez (para o gráfico)
export async function fetchLiquidityDistribution(
  network: string,
  poolAddress: string,
  currentTick: number,
  decimals0: number,
  decimals1: number,
  rangePercent: number = 50 // % ao redor do preço atual
): Promise<LiquidityTick[]> {
  // Calcula ticks de interesse (±rangePercent% do preço atual)
  const ticksPerPercent = Math.log(1.01) / Math.log(1.0001); // ~100 ticks por 1%
  const tickRange = Math.floor(ticksPerPercent * rangePercent);

  const tickLower = currentTick - tickRange;
  const tickUpper = currentTick + tickRange;

  const response = await executeQuery<TicksResponse>(
    network,
    TICKS_QUERY,
    {
      poolId: poolAddress.toLowerCase(),
      tickLower,
      tickUpper,
    }
  );

  return response.ticks.map(tick => ({
    tickIdx: parseInt(tick.tickIdx),
    price: tickToPrice(parseInt(tick.tickIdx), decimals0, decimals1),
    liquidityNet: new Decimal(tick.liquidityNet),
    liquidityGross: new Decimal(tick.liquidityGross),
  }));
}

// Busca histórico de preço baseado em swaps
export async function fetchPriceHistory(
  network: string,
  poolAddress: string,
  decimals0: number,
  decimals1: number,
  days: number = 7
): Promise<PricePoint[]> {
  const startTime = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

  const response = await executeQuery<SwapsResponse>(
    network,
    SWAPS_QUERY,
    {
      poolId: poolAddress.toLowerCase(),
      first: 1000, // Últimos 1000 swaps
      startTime,
    }
  );

  return response.swaps.map(swap => ({
    timestamp: parseInt(swap.timestamp),
    price: tickToPrice(parseInt(swap.tick), decimals0, decimals1),
    volume: new Decimal(swap.amountUSD),
  }));
}

// Busca posições de um owner
export async function fetchOwnerPositions(
  network: string,
  ownerAddress: string
): Promise<PositionsResponse['positions']> {
  const response = await executeQuery<PositionsResponse>(
    network,
    POSITIONS_QUERY,
    {
      owner: ownerAddress.toLowerCase(),
    }
  );

  return response.positions;
}

// ========================================
// FUNÇÕES AGREGADAS
// ========================================

// Busca pool completa com todos os dados
export async function fetchPoolComplete(
  network: string,
  poolAddress: string
): Promise<PoolData | null> {
  const operation = log.startOperation('Fetch complete pool', { network, poolAddress });

  try {
    // Busca dados básicos da pool
    const poolsResponse = await executeQuery<PoolsQueryResponse>(
      network,
      `
        query GetPool($id: String!) {
          pools(where: { id: $id }) {
            id
            token0 {
              id
              symbol
              decimals
            }
            token1 {
              id
              symbol
              decimals
            }
            feeTier
            liquidity
            sqrtPrice
            tick
            totalValueLockedUSD
            volumeUSD
            feesUSD
            token0Price
            token1Price
          }
        }
      `,
      { id: poolAddress.toLowerCase() }
    );

    if (poolsResponse.pools.length === 0) {
      operation.success('Pool not found');
      return null;
    }

    const pool = poolsResponse.pools[0];
    const decimals0 = parseInt(pool.token0.decimals);
    const decimals1 = parseInt(pool.token1.decimals);
    const currentTick = parseInt(pool.tick);

    // Busca dados históricos
    const { volume7d, dayDatas } = await fetchPoolHistory(network, poolAddress, 30);

    // Busca distribuição de liquidez
    const liquidityDistribution = await fetchLiquidityDistribution(
      network,
      poolAddress,
      currentTick,
      decimals0,
      decimals1
    );

    // Busca histórico de preço
    const priceHistory = await fetchPriceHistory(
      network,
      poolAddress,
      decimals0,
      decimals1
    );

    // Volume 24h (primeiro dia nos dados)
    const volume24h = dayDatas.length > 0
      ? new Decimal(dayDatas[0].volumeUSD)
      : new Decimal(0);

    const poolData: PoolData = {
      id: `${network}_uniswap_v3_${pool.id}`,
      network,
      dex: 'uniswap_v3',
      address: pool.id,
      token0: {
        address: pool.token0.id,
        symbol: pool.token0.symbol,
        decimals: decimals0,
      },
      token1: {
        address: pool.token1.id,
        symbol: pool.token1.symbol,
        decimals: decimals1,
      },
      feeTier: parseInt(pool.feeTier),
      tvlUsd: new Decimal(pool.totalValueLockedUSD),
      volume24hUsd: volume24h,
      volume7dUsd: volume7d,
      currentPrice: tickToPrice(currentTick, decimals0, decimals1),
      currentTick,
      pairType: classifyPairType(pool.token0.id, pool.token1.id),
      liquidityDistribution,
      priceHistory,
    };

    operation.success();
    return poolData;
  } catch (error) {
    operation.fail(error);
    throw error;
  }
}
