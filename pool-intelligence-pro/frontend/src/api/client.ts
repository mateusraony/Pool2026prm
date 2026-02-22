import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://pool-intelligence-api.onrender.com';

const api = axios.create({
  baseURL: API_URL + '/api',
  timeout: 30000,
});

// Types
export interface Pool {
  externalId: string;
  chain: string;
  protocol: string;
  poolAddress: string;
  token0: { symbol: string; address: string; decimals: number; priceUsd?: number };
  token1: { symbol: string; address: string; decimals: number; priceUsd?: number };
  feeTier?: number;
  price?: number;
  tvl: number;
  volume24h: number;
  volume7d?: number;
  fees24h?: number;
  fees7d?: number;
  apr?: number;
  volatilityAnn?: number; // Annualized volatility for live IL/range calculations
}

export interface Score {
  total: number;
  health: number;
  return: number;
  risk: number;
  breakdown: {
    health: { liquidityStability: number; ageScore: number; volumeConsistency: number };
    return: { volumeTvlRatio: number; feeEfficiency: number; aprEstimate: number };
    risk: { volatilityPenalty: number; liquidityDropPenalty: number; inconsistencyPenalty: number; spreadPenalty: number };
  };
  recommendedMode: 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE';
  isSuspect: boolean;
  suspectReason?: string;
}

export interface Recommendation {
  rank: number;
  pool: Pool;
  score: Score;
  commentary: string;
  probability: number;
  estimatedGainPercent: number;
  estimatedGainUsd: number;
  capitalUsed: number;
  entryConditions: string[];
  exitConditions: string[];
  mainRisks: string[];
  mode: 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE';
  dataTimestamp: string;
  validUntil: string;
}

export interface HealthData {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  providers: { name: string; isHealthy: boolean; isCircuitOpen: boolean; consecutiveFailures: number; isOptional?: boolean; note?: string }[];
  cache: { hits: number; misses: number; sets: number; keys: number; hitRate: number };
  memoryStore?: { pools: number; scores: number; watchlist: number; hasRecs: boolean; recsFresh: boolean; reads: number; hits: number; misses: number; writes: number; hitRatePct: number; estimatedKB: number };
  alerts: { rulesCount: number; recentAlertsCount: number; triggersToday: number };
  timestamp: string;
}

// API functions
export async function fetchHealth(): Promise<HealthData> {
  const { data } = await api.get('/health');
  return data;
}

export async function fetchPools(chain?: string): Promise<{ pool: Pool; score: Score }[]> {
  const { data } = await api.get('/pools', { params: { chain } });
  // Suporta novo formato (data.pools) e antigo (data.data)
  const pools = data?.pools || data?.data || [];
  // Converte UnifiedPool para o formato legado se necessário
  return pools.map((p: any) => {
    if (p.pool && p.score) return p;
    // UnifiedPool → { pool, score }
    // Mirrors backend scoreService.calculateScore() logic exactly
    const aprEstimate = p.aprTotal || p.aprFee || p.apr || 0;
    const tvl = p.tvlUSD || p.tvl || 0;
    const vol24h = p.volume24hUSD || p.volume24h || 0;
    const fees24h = p.fees24hUSD || p.fees24h || 0;

    // --- Score breakdown components (mirrors backend score.service.ts) ---

    // Health breakdown
    const liqScore = tvl >= 10e6 ? 100 : tvl >= 5e6 ? 90 : tvl >= 1e6 ? 75 : tvl >= 500000 ? 60 : tvl >= 100000 ? 40 : 20;
    const ageScore = Math.min(100, 30
      + (tvl >= 10e6 ? 30 : tvl >= 1e6 ? 20 : tvl >= 100000 ? 10 : 0)
      + (tvl > 0 && vol24h > 0 ? (vol24h / tvl >= 0.01 ? 20 : vol24h / tvl >= 0.005 ? 10 : 0) : 0)
      + (p.bluechip ? 20 : 0));
    const volRatio = tvl > 0 ? vol24h / tvl : 0;
    const volConsist = volRatio >= 0.1 ? 100 : volRatio >= 0.05 ? 80 : volRatio >= 0.01 ? 60 : volRatio >= 0.005 ? 40 : 20;

    // Return breakdown
    const vtRatio = tvl > 0 ? vol24h / tvl * 100 : 0;
    const volTvlRatio = vtRatio >= 20 ? 100 : vtRatio >= 10 ? 80 : vtRatio >= 5 ? 60 : vtRatio >= 1 ? 40 : 20;
    const feeEff = fees24h > 0 && tvl > 0
      ? Math.min(100, (() => { const r = fees24h / tvl * 365 * 100; return r >= 50 ? 100 : r >= 30 ? 80 : r >= 15 ? 60 : r >= 5 ? 40 : 20; })())
      : (p.feeTier && vol24h > 0 && tvl > 0
        ? Math.min(100, (vol24h * p.feeTier * 365) / tvl * 100)
        : (aprEstimate > 0 ? Math.min(100, aprEstimate) : 20));

    // Risk breakdown — use real volatility data when available
    const vol100 = (p.volatilityAnn || 0) * 100; // annualized vol in %
    const volatilityPenalty = p.volatilityAnn
      ? (vol100 >= 30 ? 25 : vol100 >= 20 ? 20 : vol100 >= 10 ? 12 : vol100 >= 5 ? 5 : 0)
      : 5; // conservative default when unknown
    // liquidityDropPenalty: can't calculate without tvlPeak24h (not in UnifiedPool API)
    const liquidityDropPenalty = 0;

    // --- Weighted scores (mirrors backend weights: health=40, return=35, risk=25) ---
    const healthComponent = 40 * ((liqScore / 100) * 0.4 + (ageScore / 100) * 0.2 + (volConsist / 100) * 0.4);
    const normalizedApr = Math.min(aprEstimate, 100);
    const returnComponent = 35 * ((volTvlRatio / 100) * 0.3 + (feeEff / 100) * 0.3 + (normalizedApr / 100) * 0.4);
    const riskPenalty = Math.min(25, volatilityPenalty + liquidityDropPenalty);
    const totalScore = Math.max(0, Math.min(100, healthComponent + returnComponent - riskPenalty));

    // Recommended mode: mirrors backend determineMode()
    let recommendedMode: 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE' = 'DEFENSIVE';
    if (totalScore >= 70 && vol100 <= 30) recommendedMode = 'AGGRESSIVE';
    else if (totalScore >= 50 && vol100 <= 15) recommendedMode = 'NORMAL';

    return {
      pool: {
        externalId: p.id || p.poolAddress,
        chain: p.chain,
        protocol: p.protocol,
        poolAddress: p.poolAddress,
        token0: p.token0 || { symbol: p.baseToken, address: '', decimals: 18 },
        token1: p.token1 || { symbol: p.quoteToken, address: '', decimals: 18 },
        tvl,
        volume24h: vol24h,
        fees24h,
        apr: aprEstimate,
        price: p.price,
        feeTier: p.feeTier || undefined,
        volatilityAnn: p.volatilityAnn || undefined,
      },
      score: {
        total: Math.round(totalScore * 10) / 10,
        health: Math.round(healthComponent * 10) / 10,
        return: Math.round(returnComponent * 10) / 10,
        risk: Math.round(riskPenalty * 10) / 10,
        recommendedMode,
        isSuspect: (p.warnings?.length || 0) > 0 || (aprEstimate > 500) || (vol24h > tvl * 10),
        breakdown: {
          health: { liquidityStability: liqScore, ageScore, volumeConsistency: volConsist },
          return: { volumeTvlRatio: volTvlRatio, feeEfficiency: feeEff, aprEstimate },
          risk: {
            volatilityPenalty,
            liquidityDropPenalty,
            inconsistencyPenalty: 0, // requires multi-provider consensus (not available from /pools)
            spreadPenalty: 0,        // requires order book data (not available)
          },
        },
      },
    };
  });
}

export async function fetchPool(chain: string, address: string): Promise<{ pool: Pool; score: Score } | null> {
  const { data } = await api.get('/pools/' + chain + '/' + address);
  return data.data;
}

export async function fetchRecommendations(mode?: string, limit?: number): Promise<Recommendation[]> {
  const { data } = await api.get('/recommendations', { params: { mode, limit } });
  return data.data || [];
}

// ============================================
// UNIFIED POOL (Pool Intelligence)
// ============================================

export interface UnifiedPool {
  id: string;
  chain: string;
  protocol: string;
  poolAddress: string;
  poolType: 'CL' | 'V2' | 'STABLE';
  baseToken: string;
  quoteToken: string;
  token0: { symbol: string; address: string; decimals: number };
  token1: { symbol: string; address: string; decimals: number };
  tvlUSD: number;
  price?: number;
  feeTier: number;
  volume5mUSD: number | null;
  volume1hUSD: number | null;
  volume24hUSD: number;
  fees5mUSD: number | null;
  fees1hUSD: number | null;
  fees24hUSD: number | null;
  aprFee: number | null;
  aprIncentive: number;
  aprTotal: number | null;
  aprAdjusted: number | null;
  volatilityAnn: number;
  ratio: number;
  healthScore: number;
  penaltyTotal: number;
  bluechip: boolean;
  warnings: string[];
  updatedAt: string;
  // backward compat
  tvl: number;
  volume24h: number;
}

export interface PoolsResponse {
  pools: UnifiedPool[];
  total: number;
  page: number | null;
  limit: number;
  syncing: boolean;
  tokenFilters?: string[];
}

export interface RangeResult {
  lower: number;
  upper: number;
  widthPct: number;
  lowerTick?: number;
  upperTick?: number;
  probOutOfRange: number;
  mode: string;
  horizonDays: number;
}

export interface FeeEstimate {
  expectedFees24h: number;
  expectedFees7d: number;
  expectedFees30d: number;
  userLiquidityShare: number;
  k_active: number;
}

export interface ILRiskResult {
  probOutOfRange: number;
  ilRiskScore: number;
  horizonDays: number;
}

export interface FavoritePool {
  id: string;
  poolId: string;
  chain: string;
  poolAddress: string;
  token0Symbol: string;
  token1Symbol: string;
  protocol: string;
  addedAt: string;
}

export interface PoolNote {
  id: string;
  poolId: string;
  text: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export async function fetchUnifiedPools(params?: {
  chain?: string;
  protocol?: string;
  token?: string;
  bluechip?: boolean;
  poolType?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  minTVL?: number;
  minHealth?: number;
}): Promise<PoolsResponse> {
  try {
    const { data } = await api.get('/pools', { params });
    // Support both old format (data.data) and new format
    if (data?.pools) return data;
    return { pools: data?.data || [], total: data?.count || 0, page: null, limit: 50, syncing: false };
  } catch (e) {
    console.error('fetchUnifiedPools error:', e);
    return { pools: [], total: 0, page: null, limit: 50, syncing: false };
  }
}

export async function fetchTokens(): Promise<string[]> {
  try {
    const { data } = await api.get('/tokens');
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('fetchTokens error:', e);
    return [];
  }
}

export async function fetchPoolDetail(chain: string, address: string, params?: {
  horizonDays?: number;
  riskMode?: string;
  capital?: number;
}): Promise<{
  pool: UnifiedPool;
  score: Score;
  history: { timestamp: string; price?: number; tvl: number; volume24h: number; fees24h?: number }[];
  ranges: { DEFENSIVE: RangeResult; NORMAL: RangeResult; AGGRESSIVE: RangeResult };
  selectedRange: RangeResult;
  feeEstimates: { DEFENSIVE: FeeEstimate; NORMAL: FeeEstimate; AGGRESSIVE: FeeEstimate };
  ilRisk: ILRiskResult;
} | null> {
  try {
    const { data } = await api.get(`/pools-detail/${chain}/${address}`, { params });
    return data?.data || null;
  } catch (e) {
    console.error('fetchPoolDetail error:', e);
    return null;
  }
}

export async function calcRange(params: {
  price: number;
  volAnn?: number;
  horizonDays?: number;
  riskMode?: string;
  tickSpacing?: number;
  poolType?: string;
  capital?: number;
  tvl?: number;
  fees24h?: number;
}): Promise<{
  ranges: { DEFENSIVE: RangeResult; NORMAL: RangeResult; AGGRESSIVE: RangeResult };
  selected: RangeResult;
  feeEstimate: FeeEstimate;
  ilRisk: ILRiskResult;
} | null> {
  try {
    const { data } = await api.post('/range-calc', params);
    return data?.data || null;
  } catch (e) {
    console.error('calcRange error:', e);
    return null;
  }
}

// Favorites
export async function fetchFavorites(): Promise<FavoritePool[]> {
  try {
    const { data } = await api.get('/favorites');
    return data.data || [];
  } catch {
    return [];
  }
}

export async function addFavorite(pool: {
  poolId: string; chain: string; poolAddress: string;
  token0Symbol?: string; token1Symbol?: string; protocol?: string;
}): Promise<void> {
  await api.post('/favorites', pool);
}

export async function removeFavorite(poolId: string): Promise<void> {
  await api.delete(`/favorites/${poolId}`);
}

// Notes
export async function fetchNotes(poolId?: string): Promise<PoolNote[]> {
  try {
    const { data } = await api.get('/notes', { params: { poolId } });
    return data.data || [];
  } catch {
    return [];
  }
}

export async function createNote(poolId: string, text: string, tags?: string[]): Promise<PoolNote> {
  const { data } = await api.post('/notes', { poolId, text, tags });
  return data.data;
}

export async function deleteNote(id: string): Promise<void> {
  await api.delete(`/notes/${id}`);
}

export async function fetchWatchlist(): Promise<{ poolId: string; chain: string; address: string }[]> {
  const { data } = await api.get('/watchlist');
  return data.data || [];
}

export async function addToWatchlist(poolId: string, chain: string, address: string): Promise<void> {
  await api.post('/watchlist', { poolId, chain, address });
}

export async function removeFromWatchlist(poolId: string): Promise<void> {
  await api.delete('/watchlist/' + poolId);
}

export interface NotificationSettings {
  appUrl: string;
  notifications: {
    rangeExit: boolean;
    nearRangeExit: boolean;
    dailyReport: boolean;
    newRecommendation: boolean;
    priceAlerts: boolean;
    systemAlerts: boolean;
  };
  dailyReportHour: number;
  dailyReportMinute: number;
  tokenFilters: string[];
}

export async function fetchSettings(): Promise<{
  system: { mode: string; capital: number; chains: string[] };
  notifications: NotificationSettings;
  telegram: { enabled: boolean; chatId: string | null };
}> {
  const { data } = await api.get('/settings');
  return data.data;
}

export async function updateNotificationSettings(settings: Partial<NotificationSettings>): Promise<NotificationSettings> {
  const { data } = await api.put('/settings/notifications', settings);
  return data.data;
}

export async function testTelegramConnection(): Promise<{ success: boolean }> {
  const { data } = await api.post('/settings/telegram/test');
  return data;
}

export async function testTelegramRecommendations(limit: number = 5, useTokenFilter: boolean = true): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  count?: number;
  tokenFilters?: string[];
}> {
  const { data } = await api.post('/settings/telegram/test-recommendations', { limit, useTokenFilter });
  return data;
}

export async function sendPortfolioReport(): Promise<void> {
  await api.post('/ranges/report');
}

export async function fetchLogs(limit?: number, level?: string, component?: string): Promise<{
  level: string;
  component: string;
  message: string;
  timestamp: string;
}[]> {
  const { data } = await api.get('/logs', { params: { limit, level, component } });
  return data.data || [];
}

export interface AlertRule {
  id: string;
  poolId?: string;
  type: string;
  threshold: number;
  enabled?: boolean;
}

export async function fetchAlerts(): Promise<{
  rules: { id: string; rule: { type: string; poolId?: string; value?: number } }[];
  recentAlerts: { type: string; message: string; timestamp: string }[];
}> {
  const { data } = await api.get('/alerts');
  return data.data || { rules: [], recentAlerts: [] };
}

export async function createAlert(poolId: string | undefined, type: string, threshold: number): Promise<{ id: string }> {
  const { data } = await api.post('/alerts', { poolId, type, threshold });
  return data.data;
}

export async function deleteAlert(id: string): Promise<void> {
  await api.delete('/alerts/' + id);
}

// ============================================
// RANGE MONITORING
// ============================================

export interface RangePosition {
  id: string;
  poolId: string;
  chain: string;
  poolAddress: string;
  token0Symbol: string;
  token1Symbol: string;
  rangeLower: number;
  rangeUpper: number;
  entryPrice: number;
  capital: number;
  mode: 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE';
  alertThreshold: number;
  createdAt: string;
  lastCheckedAt?: string;
  isActive: boolean;
}

export async function fetchRangePositions(): Promise<RangePosition[]> {
  const { data } = await api.get('/ranges');
  return data.data || [];
}

export async function createRangePosition(params: {
  poolId: string;
  chain: string;
  poolAddress: string;
  token0Symbol: string;
  token1Symbol: string;
  rangeLower: number;
  rangeUpper: number;
  entryPrice: number;
  capital: number;
  mode: string;
  alertThreshold?: number;
}): Promise<RangePosition> {
  const { data } = await api.post('/ranges', params);
  return data.data;
}

export async function deleteRangePosition(id: string): Promise<void> {
  await api.delete('/ranges/' + id);
}
