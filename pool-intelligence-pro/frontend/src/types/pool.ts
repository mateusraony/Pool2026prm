/**
 * Pool types used by pool-scout-pro UI components.
 * These are the "view model" types that map from the Pool2026prm API types.
 *
 * NOTE: api/client.ts defines separate API response types (Pool, FavoritePool, etc.)
 * with the same names but different structures. The types here are UI view models,
 * while api/client.ts types represent raw API responses.
 *
 * Naming convention:
 *   - types/pool.ts → UI view models (used by Scout pages)
 *   - api/client.ts → API response types (used by data fetching hooks)
 */

export interface Pool {
  id: string;
  dex: string;
  network: string;
  pair: string;
  token0: string;
  token1: string;
  feeTier: number;
  tvl: number;
  volume24h: number;
  volume7d: number;
  apr: number;
  score: number;
  risk: 'low' | 'medium' | 'high';
  priceMin: number;
  priceMax: number;
  currentPrice: number;
  ranges: {
    defensive: { min: number; max: number };
    optimized: { min: number; max: number };
    aggressive: { min: number; max: number };
  };
  metrics: {
    feesEstimated: number;
    ilEstimated: number;
    netReturn: number;
    gasEstimated: number;
    timeInRange: number;
  };
  explanation: string;
  // Pool2026prm raw data reference
  poolAddress?: string;
  chain?: string;
  protocol?: string;
  // Modo recomendado pelo score (DEFENSIVE / NORMAL / AGGRESSIVE)
  recommendedMode?: string;
  // Confiança dos dados — propagado do UnifiedPool
  dataConfidence?: {
    price?: { method: 'observed' | 'estimated_stable' | 'estimated_tvl' | 'unavailable'; confidence: 'high' | 'medium' | 'low' };
    volume?: { method: 'observed' | 'supplement_gecko' | 'estimated_apy'; confidence: 'high' | 'medium' | 'low' };
    fees?: { method: 'observed' | 'derived_volume' | 'estimated_apy'; confidence: 'high' | 'medium' | 'low' };
    volatility?: { method: 'log_returns' | 'proxy'; dataPoints: number; confidence: 'high' | 'medium' | 'low' };
    apr?: { method: 'real_fees' | 'adapter_apy' | 'unavailable'; confidence: 'high' | 'medium' | 'low' };
  };
}

export interface ActivePool extends Pool {
  capital: number;
  capitalPercent: number;
  entryDate: string;
  pnl: number;
  feesAccrued: number;
  ilActual: number;
  status: 'ok' | 'attention' | 'critical';
  lastAction: string;
  rangeSelected: 'defensive' | 'optimized' | 'aggressive' | 'custom';
}

export interface FavoritePool extends Pool {
  addedDate: string;
  status: 'new' | 'studying' | 'ready' | 'archived';
  notes?: string;
  rangeSelected: 'defensive' | 'optimized' | 'aggressive' | 'custom';
  capitalSuggested: number;
  capitalSuggestedPercent: number;
}

export interface HistoryEntry {
  id: string;
  poolId: string;
  pool: Pool;
  type: 'entry' | 'rebalance' | 'exit';
  date: string;
  capital: number;
  range: { min: number; max: number };
  reason: string;
  result?: {
    pnl: number;
    fees: number;
    il: number;
  };
}

export interface RiskConfig {
  totalBanca: number;
  profile: 'defensive' | 'normal' | 'aggressive';
  maxPerPool: number;
  maxPerNetwork: number;
  maxVolatile: number;
  allowedNetworks: string[];
  allowedDexs: string[];
  allowedTokens: string[];
  excludeMemecoins: boolean;
  telegramChatId?: string;
  telegramEnabled?: boolean;
}

export interface ManualAnalysis {
  id?: string;
  network: string;
  dex: string;
  token0: string;
  token1: string;
  feeTier: number;
  currentPrice: number;
  rangeMin: number;
  rangeMax: number;
  capital: number;
  status?: 'pending' | 'active' | 'closed' | 'profitable' | 'loss';
  rangeWidth?: number;
  timeInRange?: number;
  feesEstimated?: number;
  ilEstimated?: number;
  netReturn?: number;
  riskLevel?: 'low' | 'medium' | 'high';
  score?: number;
  aiAnalysis?: object;
  notes?: string;
  createdAt?: string;
}

export interface Alert {
  id: string;
  poolId?: string;
  activePoolId?: string;
  alertType: 'maintenance' | 'risk' | 'opportunity';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  data?: object;
  isRead: boolean;
  isSentTelegram: boolean;
  createdAt: string;
}
