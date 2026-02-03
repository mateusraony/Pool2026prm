// Tipos de resposta do The Graph para Uniswap V3

export interface PoolSubgraphData {
  id: string;
  token0: {
    id: string;
    symbol: string;
    decimals: string;
  };
  token1: {
    id: string;
    symbol: string;
    decimals: string;
  };
  feeTier: string;
  liquidity: string;
  sqrtPrice: string;
  tick: string;
  totalValueLockedUSD: string;
  totalValueLockedToken0: string;
  totalValueLockedToken1: string;
  volumeUSD: string;
  feesUSD: string;
  txCount: string;
  token0Price: string;
  token1Price: string;
}

export interface PoolsQueryResponse {
  pools: PoolSubgraphData[];
}

export interface PoolDayDataSubgraph {
  date: number;
  volumeUSD: string;
  tvlUSD: string;
  feesUSD: string;
  open: string;
  high: string;
  low: string;
  close: string;
}

export interface PoolDayDatasResponse {
  poolDayDatas: PoolDayDataSubgraph[];
}

export interface SwapSubgraph {
  timestamp: string;
  amount0: string;
  amount1: string;
  amountUSD: string;
  sqrtPriceX96: string;
  tick: string;
}

export interface SwapsResponse {
  swaps: SwapSubgraph[];
}

export interface TickSubgraph {
  tickIdx: string;
  liquidityNet: string;
  liquidityGross: string;
  price0: string;
  price1: string;
}

export interface TicksResponse {
  ticks: TickSubgraph[];
}

export interface PositionSubgraph {
  id: string;
  owner: string;
  pool: {
    id: string;
    token0: {
      id: string;
      symbol: string;
      decimals: string;
    };
    token1: {
      id: string;
      symbol: string;
      decimals: string;
    };
    feeTier: string;
  };
  tickLower: {
    tickIdx: string;
    price0: string;
    price1: string;
  };
  tickUpper: {
    tickIdx: string;
    price0: string;
    price1: string;
  };
  liquidity: string;
  depositedToken0: string;
  depositedToken1: string;
  withdrawnToken0: string;
  withdrawnToken1: string;
  collectedFeesToken0: string;
  collectedFeesToken1: string;
}

export interface PositionsResponse {
  positions: PositionSubgraph[];
}

export interface TokenSubgraph {
  id: string;
  symbol: string;
  name: string;
  decimals: string;
  derivedETH: string;
  totalValueLockedUSD: string;
}

export interface TokensResponse {
  tokens: TokenSubgraph[];
}

export interface BundleSubgraph {
  ethPriceUSD: string;
}

export interface BundleResponse {
  bundle: BundleSubgraph;
}
