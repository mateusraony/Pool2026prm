import axios, { AxiosError } from 'axios';

// Resolve API URL: ignore localhost values in production (common misconfiguration)
function resolveApiUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl;
  }
  return 'https://pool-intelligence-api.onrender.com';
}

const API_URL = resolveApiUrl();

// Export for diagnostics (shown in error messages)
export const API_BASE_URL = API_URL;

const api = axios.create({
  baseURL: API_URL + '/api',
  timeout: 60000, // 60s for Render free tier cold starts
});

// Retry interceptor: handles cold starts (Render free tier sleeps after 15min)
api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config;
  if (!config) return Promise.reject(error);

  const retryCount = (config as any).__retryCount || 0;
  const isRetryable =
    !error.response || // network error (backend sleeping)
    error.response.status === 502 || // bad gateway (waking up)
    error.response.status === 503 || // service unavailable
    error.code === 'ECONNABORTED'; // timeout

  if (isRetryable && retryCount < 2) {
    (config as any).__retryCount = retryCount + 1;
    // Wait before retry: 3s first, 8s second (gives cold start time)
    await new Promise(r => setTimeout(r, retryCount === 0 ? 3000 : 8000));
    return api.request(config);
  }

  return Promise.reject(error);
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
    // Use aprTotal (computed from fees) → aprFee → apr (adapter APY e.g. DefiLlama) → 0
    const aprEstimate = p.aprTotal || p.aprFee || p.apr || 0;
    // Derive score breakdown from real data, not hardcoded
    const tvl = p.tvlUSD || p.tvl || 0;
    const vol24h = p.volume24hUSD || p.volume24h || 0;
    const volTvlRatio = tvl > 0 ? Math.min(100, (vol24h / tvl) * 100 * 5) : 0;
    const feeEff = (p.fees24hUSD || p.fees24h || 0) > 0 && tvl > 0
      ? Math.min(100, ((p.fees24hUSD || p.fees24h || 0) / tvl) * 365 * 100)
      : (aprEstimate > 0 ? Math.min(100, aprEstimate) : 0);
    const liqScore = tvl >= 10e6 ? 100 : tvl >= 1e6 ? 75 : tvl >= 100000 ? 40 : 20;
    const volConsist = tvl > 0 ? Math.min(100, (vol24h / tvl) * 1000) : 0;

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
        fees24h: p.fees24hUSD || p.fees24h || 0,
        apr: aprEstimate,
        price: p.price,
        feeTier: p.feeTier || 0.003,
        volatilityAnn: p.volatilityAnn || undefined,
      },
      score: {
        total: p.healthScore || 50,
        health: p.healthScore || 50,
        return: 0,
        risk: 0,
        recommendedMode: 'NORMAL' as const,
        isSuspect: (p.warnings?.length || 0) > 0,
        breakdown: {
          health: { liquidityStability: liqScore, ageScore: 50, volumeConsistency: volConsist },
          return: { volumeTvlRatio: volTvlRatio, feeEfficiency: feeEff, aprEstimate },
          risk: { volatilityPenalty: 0, liquidityDropPenalty: 0, inconsistencyPenalty: 0, spreadPenalty: 0 },
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
  const { data } = await api.get('/pools', { params });
  // Support both old format (data.data) and new format
  if (data?.pools) return data;
  return { pools: data?.data || [], total: data?.count || 0, page: null, limit: 50, syncing: false };
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
