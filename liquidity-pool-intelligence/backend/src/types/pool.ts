import { Decimal } from 'decimal.js';

// Tipos para pools de liquidez

export interface PoolData {
  id: string; // network_dex_address
  network: string;
  dex: string;
  address: string;
  token0: TokenInfo;
  token1: TokenInfo;
  feeTier: number;
  tvlUsd: Decimal;
  volume24hUsd: Decimal;
  volume7dUsd: Decimal;
  currentPrice: Decimal;
  currentTick?: number;
  aprEstimate?: Decimal;
  pairType: PairType;
  liquidityDistribution?: LiquidityTick[];
  priceHistory?: PricePoint[];
}

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  priceUsd?: Decimal;
}

export type PairType = 'stable_stable' | 'bluechip_stable' | 'altcoin_stable' | 'other';

export interface LiquidityTick {
  tickIdx: number;
  price: Decimal;
  liquidityNet: Decimal;
  liquidityGross: Decimal;
}

export interface PricePoint {
  timestamp: number;
  price: Decimal;
  volume?: Decimal;
}

// Range sugerido para uma pool
export interface PoolRangeData {
  poolId: string;
  rangeType: RangeType;
  priceLower: Decimal;
  priceUpper: Decimal;
  tickLower?: number;
  tickUpper?: number;
  metrics: RangeMetrics;
  capitalSuggestion: CapitalSuggestion;
  explanation: string;
}

export type RangeType = 'DEFENSIVE' | 'OPTIMIZED' | 'AGGRESSIVE';

export interface RangeMetrics {
  score: number; // 0-100
  feesEstimate7d: Decimal; // % do capital
  ilEstimate7d: Decimal; // % do capital
  gasEstimate: Decimal; // USD
  netReturn7d: Decimal; // % do capital
  timeInRange7d: Decimal; // % do tempo
  riskLevel: 'low' | 'medium' | 'high';
}

export interface CapitalSuggestion {
  percentOfBankroll: Decimal;
  amountUsd: Decimal;
  reason: string;
}

// Pool recomendada (para a lista)
export interface RecommendedPool {
  pool: PoolData;
  ranges: PoolRangeData[];
  bestRange: PoolRangeData;
  overallScore: number;
  warnings: string[];
}

// Backtest result
export interface BacktestResult {
  poolId: string;
  rangeType: RangeType;
  period: '7d' | '30d';
  startDate: Date;
  endDate: Date;
  metrics: {
    timeInRange: Decimal; // %
    totalFees: Decimal; // USD
    totalIL: Decimal; // USD
    netPnL: Decimal; // USD
    netPnLPercent: Decimal; // %
    maxDrawdown: Decimal; // %
    rebalancesNeeded: number;
  };
  dailyData: {
    date: Date;
    inRange: boolean;
    fees: Decimal;
    il: Decimal;
    cumulativePnL: Decimal;
  }[];
}

// Filtros para busca de pools
export interface PoolFilters {
  networks?: string[];
  pairTypes?: PairType[];
  minTvlUsd?: number;
  minVolume24hUsd?: number;
  feeTiers?: number[];
  limit?: number;
}

// Response da API
export interface PoolsResponse {
  pools: RecommendedPool[];
  totalCount: number;
  lastUpdated: Date;
  filters: PoolFilters;
}

export interface PoolDetailResponse {
  pool: PoolData;
  ranges: PoolRangeData[];
  liquidityChart: LiquidityTick[];
  priceHistory: PricePoint[];
  backtest7d?: BacktestResult;
  backtest30d?: BacktestResult;
}
