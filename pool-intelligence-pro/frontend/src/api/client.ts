import axios, { AxiosError } from 'axios';
import { toast } from 'sonner';

// Resolve API base URL (the part BEFORE /api):
// In production (Render single-service): empty string → relative /api paths
// In development: uses Vite proxy, so also empty string
// Only use VITE_API_URL if explicitly set to a DIFFERENT external service
function resolveApiUrl(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (
    envUrl &&
    envUrl !== '/' &&
    !envUrl.includes('localhost') &&
    !envUrl.includes('127.0.0.1') &&
    !envUrl.includes('pool-intelligence-api') // old service name — ignore
  ) {
    // Strip trailing slashes to prevent double-slash (e.g. "https://x.com/" + "/api" → "https://x.com//api")
    return envUrl.replace(/\/+$/, '');
  }
  // Same-origin: frontend is served by the backend Express server
  // Relative paths (/api/...) go to the same host automatically
  return '';
}

const API_URL = resolveApiUrl();

// Export for diagnostics (shown in error messages)
export const API_BASE_URL = API_URL || '(same-origin)';

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

  // Show user-friendly toast for unrecoverable errors
  const status = error.response?.status;
  const serverMsg = (error.response?.data as any)?.error;
  if (status === 401 || status === 403) {
    toast.error('Acesso negado', { description: serverMsg || 'Você não tem permissão para esta ação.' });
  } else if (status === 404) {
    // 404 is common for missing optional resources — don't toast
  } else if (status === 422 || status === 400) {
    toast.error('Dados inválidos', { description: serverMsg || 'Verifique os campos e tente novamente.' });
  } else if (status && status >= 500) {
    toast.error('Erro no servidor', { description: serverMsg || 'Tente novamente em instantes.' });
  } else if (!error.response) {
    toast.error('Sem conexão', { description: 'Não foi possível conectar ao servidor após 2 tentativas.' });
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
  uptime?: { seconds: number; formatted: string };
  memory?: { rssBytes: number; heapUsedBytes: number; heapTotalBytes: number; rssMB: number; heapUsedMB: number };
  providers: { name: string; isHealthy: boolean; isCircuitOpen: boolean; consecutiveFailures: number; isOptional?: boolean; note?: string }[];
  cache: { hits: number; misses: number; sets: number; keys: number; hitRate: number };
  memoryStore?: { pools: number; scores: number; watchlist: number; hasRecs: boolean; recsFresh: boolean; reads: number; hits: number; misses: number; writes: number; hitRatePct: number; estimatedKB: number };
  alerts: { rulesCount: number; recentAlertsCount: number; triggersToday: number };
  requests?: {
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
    avgDurationMs: number;
    byEndpoint: Record<string, { count: number; avgMs: number; p95Ms: number; maxMs: number; errors: number }>;
  };
  jobs?: Record<string, { totalRuns: number; successes: number; failures: number; avgDurationMs: number; lastRunAt: string | null; lastDurationMs: number | null }>;
  logs?: { INFO: number; WARN: number; ERROR: number; CRITICAL: number };
  timestamp: string;
}

// ============================================
// RESPONSE VALIDATION
// ============================================

/** Check essential fields on a pool object. Returns warnings for missing data. */
function validatePool(pool: any, source: string): string[] {
  const warnings: string[] = [];
  if (!pool) {
    warnings.push(`[${source}] pool object is null/undefined`);
    return warnings;
  }
  if (!pool.chain) warnings.push(`[${source}] missing chain`);
  if (!pool.poolAddress && !pool.externalId) warnings.push(`[${source}] missing poolAddress and externalId`);
  if (pool.tvl == null && pool.tvlUSD == null) warnings.push(`[${source}] missing tvl`);
  if (!pool.token0 && !pool.baseToken) warnings.push(`[${source}] missing token0 info`);
  if (!pool.token1 && !pool.quoteToken) warnings.push(`[${source}] missing token1 info`);
  if (warnings.length > 0) {
    console.warn('Pool validation warnings:', warnings);
  }
  return warnings;
}

/** Ensure pool has safe defaults for essential fields to prevent crashes. */
function safePool<T extends Record<string, any>>(pool: T): T {
  return {
    ...pool,
    chain: pool.chain || 'unknown',
    poolAddress: pool.poolAddress || pool.externalId || '',
    tvl: pool.tvl ?? pool.tvlUSD ?? 0,
    volume24h: pool.volume24h ?? pool.volume24hUSD ?? 0,
    token0: pool.token0 || { symbol: pool.baseToken || '?', address: '', decimals: 18 },
    token1: pool.token1 || { symbol: pool.quoteToken || '?', address: '', decimals: 18 },
  };
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
    if (p.pool && p.score) {
      validatePool(p.pool, 'fetchPools');
      p.pool = safePool(p.pool);
      return p;
    }
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

    validatePool(p, 'fetchPools/unified');
    const poolObj = safePool({
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
    });
    // Derive recommendedMode from actual data: low volatility + high score → AGGRESSIVE
    const vol_pct = (p.volatilityAnn ?? 0) * 100; // convert decimal to percent
    const hScore = p.healthScore || 50;
    const derivedMode: 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE' =
      hScore >= 70 && vol_pct <= 15 ? 'AGGRESSIVE'
      : hScore >= 50 && vol_pct <= 30 ? 'NORMAL'
      : 'DEFENSIVE';
    return {
      pool: poolObj,
      score: {
        total: p.healthScore || 50,
        health: p.healthScore || 50,
        return: 0,
        risk: 0,
        recommendedMode: derivedMode,
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
  const result = data.data;
  if (result?.pool) {
    validatePool(result.pool, 'fetchPool');
    result.pool = safePool(result.pool);
  }
  return result;
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
  priceChange24h?: number;
  ratio: number;
  healthScore: number;
  penaltyTotal: number;
  bluechip: boolean;
  warnings: string[];
  updatedAt: string;
  dataConfidence?: {
    price?: { method: 'observed' | 'estimated_stable' | 'estimated_tvl' | 'unavailable'; confidence: 'high' | 'medium' | 'low' };
    volume?: { method: 'observed' | 'supplement_gecko' | 'estimated_apy'; confidence: 'high' | 'medium' | 'low' };
    fees?: { method: 'observed' | 'derived_volume' | 'estimated_apy'; confidence: 'high' | 'medium' | 'low' };
    volatility?: { method: 'log_returns' | 'proxy'; dataPoints: number; confidence: 'high' | 'medium' | 'low' };
    apr?: { method: 'real_fees' | 'adapter_apy' | 'unavailable'; confidence: 'high' | 'medium' | 'low' };
  };
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
    const tokens = data?.data;
    return Array.isArray(tokens) ? tokens : [];
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
    const result = data?.data || null;
    if (result?.pool) {
      validatePool(result.pool, 'fetchPoolDetail');
      result.pool = safePool(result.pool);
    }
    return result;
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

// Liquidity Distribution
export interface LiquidityBar {
  price: number;
  liquidity: number; // 0-100 normalized
}

export interface LiquidityDistribution {
  bars: LiquidityBar[];
  currentPrice: number;
  tvl: number;
  volatility: number;
  rangeMin: number;
  rangeMax: number;
}

export async function fetchLiquidityDistribution(chain: string, address: string, bars?: number): Promise<LiquidityDistribution | null> {
  try {
    const { data } = await api.get(`/pools-liquidity/${chain}/${address}`, { params: { bars } });
    return data.data || null;
  } catch {
    return null;
  }
}

// Monte Carlo Simulation
export interface MonteCarloOutcome {
  finalPrice: number;
  priceChange: number;
  feesEarned: number;
  ilLoss: number;
  pnl: number;
  pnlPercent: number;
  isInRange: boolean;
}

export interface MonteCarloResult {
  scenarios: number;
  horizonDays: number;
  percentiles: {
    p5: MonteCarloOutcome;
    p25: MonteCarloOutcome;
    p50: MonteCarloOutcome;
    p75: MonteCarloOutcome;
    p95: MonteCarloOutcome;
  };
  probProfit: number;
  probOutOfRange: number;
  avgPnl: number;
  worstCase: MonteCarloOutcome;
  bestCase: MonteCarloOutcome;
  distribution: { bucket: string; count: number }[];
  pool: { price: number; tvl: number; fees24h: number; volatility: number; rangeLower: number; rangeUpper: number };
}

export async function runMonteCarlo(params: {
  chain: string;
  address: string;
  capital?: number;
  horizonDays?: number;
  scenarios?: number;
  mode?: string;
}): Promise<MonteCarloResult | null> {
  try {
    const { data } = await api.post('/monte-carlo', params);
    return data.data || null;
  } catch {
    return null;
  }
}

// Backtest
export interface BacktestResult {
  periodDays: number;
  totalFees: number;
  totalIL: number;
  netPnl: number;
  netPnlPercent: number;
  maxDrawdown: number;
  timeInRange: number;
  rebalances: number;
  dailyReturns: { day: number; cumPnl: number; fees: number; il: number }[];
  pool: { price: number; tvl: number; fees24h: number; volatility: number; rangeLower: number; rangeUpper: number };
}

export async function runBacktest(params: {
  chain: string;
  address: string;
  capital?: number;
  periodDays?: number;
  mode?: string;
}): Promise<BacktestResult | null> {
  try {
    const { data } = await api.post('/backtest', params);
    return data.data || null;
  } catch {
    return null;
  }
}

// LVR (Loss-Versus-Rebalancing)
export interface LVRResult {
  lvrDaily: number;
  lvrAnnualized: number;
  lvrPercent: number;
  feeToLvrRatio: number;
  netAfterLvr: number;
  verdict: 'profitable' | 'marginal' | 'unprofitable';
  pool: { tvl: number; fees24h: number; volatility: number };
}

export async function fetchLVR(params: {
  chain: string;
  address: string;
  capital?: number;
  mode?: string;
}): Promise<LVRResult | null> {
  try {
    const { data } = await api.post('/lvr', params);
    return data.data || null;
  } catch {
    return null;
  }
}

// Fee Tier Comparison
export interface FeeTierComparison {
  poolAddress: string;
  feeTier: number;
  feeTierBps: number;
  tvl: number;
  volume24h: number;
  fees24h: number;
  apr: number;
  volatility: number;
  healthScore: number;
  feeEstimate30d: number;
  ilRisk: number;
  lvr: number;
  lvrVerdict: string;
  rangeWidth: number;
  protocol: string;
}

export async function fetchFeeTiers(chain: string, token0: string, token1: string, capital?: number, mode?: string): Promise<FeeTierComparison[]> {
  try {
    const { data } = await api.get(`/fee-tiers/${chain}/${token0}/${token1}`, { params: { capital, mode } });
    return data.data || [];
  } catch {
    return [];
  }
}

// Portfolio Analytics
export interface PortfolioAnalytics {
  totalCapital: number;
  totalPnl: number;
  totalPnlPercent: number;
  weightedApr: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  riskAdjustedApr: number;
  diversificationScore: number;
  allocationByChain: { chain: string; capital: number; percent: number }[];
  allocationByProtocol: { protocol: string; capital: number; percent: number }[];
  allocationByToken: { token: string; exposure: number; percent: number }[];
  riskBand: 'conservative' | 'balanced' | 'aggressive';
}

export async function fetchPortfolioAnalytics(): Promise<PortfolioAnalytics | null> {
  try {
    const { data } = await api.get('/portfolio-analytics');
    return data.data || null;
  } catch {
    return null;
  }
}

// Auto-Compound Simulator
export interface AutoCompoundResult {
  withoutCompound: number;
  withCompound: number;
  compoundBenefit: number;
  compoundBenefitPercent: number;
  schedule: { period: number; valueSimple: number; valueCompound: number; feesEarned: number }[];
  optimalFrequency: string;
  gasCostEstimate: number;
  pool: { apr: number; chain: string; address: string };
}

export async function runAutoCompound(params: {
  chain: string;
  address: string;
  capital?: number;
  periodDays?: number;
  compoundFrequency?: string;
  gasPerCompound?: number;
}): Promise<AutoCompoundResult | null> {
  try {
    const { data } = await api.post('/auto-compound', params);
    return data.data || null;
  } catch {
    return null;
  }
}

// Token Correlation
export interface TokenCorrelationResult {
  token0: string;
  token1: string;
  correlation: number;
  correlationLabel: string;
  ilImpact: string;
  pairType: 'stablecoin' | 'correlated' | 'uncorrelated' | 'inverse';
  riskAssessment: string;
  volToken0: number;
  volToken1: number;
  combinedVol: number;
}

export async function fetchTokenCorrelation(chain: string, address: string): Promise<TokenCorrelationResult | null> {
  try {
    const { data } = await api.get(`/token-correlation/${chain}/${address}`);
    return data.data || null;
  } catch {
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
  telegram: { enabled: boolean; chatId: string | null; hasChatId?: boolean; hasBot?: boolean };
  riskConfig?: any;
  alertConfig?: { cooldownMinutes: number; maxAlertsPerHour: number; dedupeWindowMinutes: number };
}> {
  const { data } = await api.get('/settings');
  return data.data;
}

export async function updateTelegramConfig(params: {
  chatId?: string;
  botToken?: string;
}): Promise<{
  enabled: boolean;
  chatId: string | null;
  hasChatId: boolean;
  hasBot: boolean;
}> {
  const { data } = await api.put('/settings/telegram', params);
  return data.data;
}

export async function updateNotificationSettings(settings: Partial<NotificationSettings>): Promise<NotificationSettings> {
  const { data } = await api.put('/settings/notifications', settings);
  return data.data;
}

export async function saveRiskConfig(riskConfig: any): Promise<any> {
  const { data } = await api.put('/settings/risk-config', riskConfig);
  return data.data;
}

export async function testTelegramConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
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

export async function createAlert(
  poolId: string | undefined,
  type: string,
  threshold: number,
  condition?: { rangeLower: number; rangeUpper: number },
): Promise<{ id: string }> {
  const { data } = await api.post('/alerts', { poolId, type, threshold, condition });
  return data.data;
}

export async function deleteAlert(id: string): Promise<void> {
  await api.delete('/alerts/' + id);
}

// ============================================
// RANGE MONITORING
// ============================================

export interface PositionPnL {
  feesAccrued: number;
  ilActual: number;
  pnl: number;
  pnlPercent: number;
  daysActive: number;
  feeAPR: number;
  hodlValue: number;
  lpValue: number;
}

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
  // Enriched P&L data from backend
  currentPrice?: number;
  poolScore?: number | null;
  poolApr?: number | null;
  pnl?: PositionPnL | null;
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

// ============================================
// HISTORY
// ============================================

export interface PositionHistoryEntry {
  id: string;
  poolId: string;
  chain: string;
  poolAddress: string;
  token0: string;
  token1: string;
  type: 'ENTRY' | 'EXIT' | 'REBALANCE' | 'FEE_COLLECT';
  mode?: string;
  capital?: number;
  pnl?: number;
  rangeLower?: number;
  rangeUpper?: number;
  price?: number;
  note?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export async function fetchHistory(params?: {
  poolId?: string; chain?: string; type?: string; limit?: number; offset?: number;
}): Promise<{ data: PositionHistoryEntry[]; total: number }> {
  try {
    const { data } = await api.get('/history', { params });
    return { data: data.data || [], total: data.total || 0 };
  } catch {
    return { data: [], total: 0 };
  }
}

export async function createHistoryEntry(entry: Omit<PositionHistoryEntry, 'id' | 'createdAt'>): Promise<PositionHistoryEntry> {
  const { data } = await api.post('/history', entry);
  return data.data;
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  await api.delete('/history/' + id);
}

// ============================================================
// INTEGRATIONS API — ETAPA 14
// ============================================================

export interface Integration {
  id: string;
  type: 'discord' | 'slack' | 'webhook';
  name: string;
  url: string;
  enabled: boolean;
  events: string[];
  createdAt: string;
  lastTriggeredAt?: string;
  successCount: number;
  errorCount: number;
  lastError?: string;
}

function adminHeaders(adminKey?: string): Record<string, string> | undefined {
  return adminKey ? { 'X-Admin-Key': adminKey } : undefined;
}

export async function fetchIntegrations(adminKey?: string): Promise<Integration[]> {
  const res = await api.get<{ success: boolean; data: Integration[] }>('/integrations', { headers: adminHeaders(adminKey) });
  return res.data.data ?? [];
}

export async function createIntegration(params: {
  name: string;
  type: 'discord' | 'slack' | 'webhook';
  url: string;
  enabled?: boolean;
  events?: string[];
}, adminKey?: string): Promise<Integration> {
  const res = await api.post<{ success: boolean; data: Integration }>('/integrations', params, { headers: adminHeaders(adminKey) });
  return res.data.data;
}

export async function updateIntegration(id: string, params: Partial<Pick<Integration, 'name' | 'url' | 'enabled' | 'events'>>, adminKey?: string): Promise<Integration> {
  const res = await api.put<{ success: boolean; data: Integration }>(`/integrations/${id}`, params, { headers: adminHeaders(adminKey) });
  return res.data.data;
}

export async function deleteIntegration(id: string, adminKey?: string): Promise<void> {
  await api.delete(`/integrations/${id}`, { headers: adminHeaders(adminKey) });
}

export async function testIntegration(id: string, adminKey?: string): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  const res = await api.post<{ success: boolean; data: { ok: boolean; statusCode?: number; error?: string } }>(`/integrations/${id}/test`, undefined, { headers: adminHeaders(adminKey) });
  return res.data.data;
}

export async function testIntegrationUrl(url: string, type: string, adminKey?: string): Promise<{ ok: boolean; statusCode?: number; error?: string }> {
  const res = await api.post<{ success: boolean; data: { ok: boolean; statusCode?: number; error?: string } }>('/integrations/test-url', { url, type }, { headers: adminHeaders(adminKey) });
  return res.data.data;
}

// ============================================================
// PRICE HISTORY (OHLCV) API — ETAPA 15
// ============================================================

export interface OhlcvCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OhlcvResult {
  chain: string;
  address: string;
  timeframe: 'day' | 'hour' | 'minute';
  candles: OhlcvCandle[];
  currency: 'usd';
  token: 'base' | 'quote';
  fetchedAt: string;
}

export async function fetchOhlcv(
  chain: string,
  address: string,
  timeframe: 'day' | 'hour' | 'minute' = 'hour',
  limit = 168
): Promise<OhlcvResult | null> {
  try {
    const res = await api.get<{ success: boolean; data: OhlcvResult }>(
      `/pools/${chain}/${address}/ohlcv?timeframe=${timeframe}&limit=${limit}`
    );
    return res.data.data ?? null;
  } catch {
    return null;
  }
}

// ============================================================
// RAW AXIOS CLIENT — ETAPA 17
// Exported for hooks that need direct axios access (e.g. push notifications)
// ============================================================
// ============================================================
// MARKET CONDITIONS — Fase 4
// ============================================================

export type MarketRegime =
  | 'RANGING'
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'HIGH_VOLATILITY'
  | 'LOW_LIQUIDITY'
  | 'UNKNOWN';

export interface MarketConditions {
  globalRegime: MarketRegime;
  noOperateGlobal: boolean;
  noOperateReason?: string;
  poolCount: number;
  highRiskCount: number;
  updatedAt: string;
}

export async function fetchMarketConditions(): Promise<MarketConditions | null> {
  try {
    const { data } = await api.get<{ success: boolean; data: MarketConditions }>('/market-conditions');
    return data.data ?? null;
  } catch {
    return null;
  }
}

export { api as apiClient };
