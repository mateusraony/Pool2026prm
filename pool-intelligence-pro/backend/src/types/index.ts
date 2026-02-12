// ============================================
// POOL TYPES
// ============================================

export interface Pool {
  externalId: string;
  chain: string;
  protocol: string;
  poolAddress: string;
  token0: Token;
  token1: Token;
  feeTier?: number;
  price?: number;
  tvl: number;
  volume24h: number;
  volume7d?: number;
  fees24h?: number;
  fees7d?: number;
  apr?: number;
}

export interface Token {
  symbol: string;
  address: string;
  decimals: number;
  priceUsd?: number;
}

export interface PoolMetrics {
  volatility24h?: number;
  volatility7d?: number;
  priceChange24h?: number;
  priceChange7d?: number;
  rsi14?: number;
  macdLine?: number;
  macdSignal?: number;
  macdHistogram?: number;
}

export interface PoolWithMetrics extends Pool {
  metrics: PoolMetrics;
  dataQuality: DataQuality;
  lastUpdated: Date;
}

export type DataQuality = 'GOOD' | 'STALE' | 'SUSPECT' | 'MISSING';

// ============================================
// SCORE TYPES
// ============================================

export interface Score {
  total: number; // 0-100
  health: number; // 0-40
  return: number; // 0-35
  risk: number; // 0-25
  breakdown: ScoreBreakdown;
  recommendedMode: Mode;
  isSuspect: boolean;
  suspectReason?: string;
}

export interface ScoreBreakdown {
  health: {
    liquidityStability: number;
    ageScore: number;
    volumeConsistency: number;
  };
  return: {
    volumeTvlRatio: number;
    feeEfficiency: number;
    aprEstimate: number;
  };
  risk: {
    volatilityPenalty: number;
    liquidityDropPenalty: number;
    inconsistencyPenalty: number;
    spreadPenalty: number;
  };
}

export type Mode = 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE';

// ============================================
// RECOMMENDATION TYPES
// ============================================

export interface Recommendation {
  rank: number; // 1, 2 ou 3
  pool: Pool;
  score: Score;
  commentary: string;
  probability: number; // 0-100%
  estimatedGainPercent: number;
  estimatedGainUsd: number;
  capitalUsed: number;
  entryConditions: string[];
  exitConditions: string[];
  mainRisks: string[];
  mode: Mode;
  dataTimestamp: Date;
  validUntil: Date;
}

// ============================================
// ALERT TYPES
// ============================================

export type AlertType = 
  | 'PRICE_ABOVE'
  | 'PRICE_BELOW'
  | 'RSI_ABOVE'
  | 'RSI_BELOW'
  | 'MACD_CROSS_UP'
  | 'MACD_CROSS_DOWN'
  | 'VOLUME_DROP'
  | 'LIQUIDITY_FLIGHT'
  | 'VOLATILITY_SPIKE'
  | 'OUT_OF_RANGE'
  | 'NEW_RECOMMENDATION';

export interface AlertTrigger {
  type: AlertType;
  poolId?: string;
  value?: number;
  condition?: Record<string, unknown>;
}

export interface AlertEvent {
  type: AlertType;
  pool?: Pool;
  message: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

// ============================================
// PROVIDER TYPES
// ============================================

export interface ProviderAdapter {
  name: string;
  
  // Métodos obrigatórios
  getPools(chain: string, limit?: number): Promise<Pool[]>;
  getPool(chain: string, address: string): Promise<Pool | null>;
  
  // Métodos opcionais
  getPoolHistory?(chain: string, address: string, days: number): Promise<PoolSnapshot[]>;
  getPrice?(chain: string, tokenAddress: string): Promise<number | null>;
  
  // Health check
  healthCheck(): Promise<boolean>;
}

export interface PoolSnapshot {
  timestamp: Date;
  price?: number;
  tvl: number;
  volume24h: number;
  fees24h?: number;
}

export interface ProviderHealth {
  name: string;
  isHealthy: boolean;
  isCircuitOpen: boolean;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  consecutiveFailures: number;
  avgLatency?: number;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
  stale?: boolean;
  staleSince?: Date;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================
// SYSTEM TYPES
// ============================================

export interface SystemHealth {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  providers: ProviderHealth[];
  lastRadarRun?: Date;
  lastWatchlistUpdate?: Date;
  lastScoreCalculation?: Date;
  lastRecommendation?: Date;
  activeAlerts: number;
  staleDataCount: number;
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
export type LogComponent = 'RADAR' | 'WATCHLIST' | 'SCORE' | 'RECOMMENDATION' | 'ALERT' | 'PROVIDER' | 'SYSTEM';
