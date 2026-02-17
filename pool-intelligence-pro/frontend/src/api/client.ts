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
  providers: { name: string; isHealthy: boolean; isCircuitOpen: boolean; consecutiveFailures: number }[];
  cache: { hits: number; misses: number; sets: number; keys: number; hitRate: number };
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
  return data.data || [];
}

export async function fetchPool(chain: string, address: string): Promise<{ pool: Pool; score: Score } | null> {
  const { data } = await api.get('/pools/' + chain + '/' + address);
  return data.data;
}

export async function fetchRecommendations(mode?: string, limit?: number): Promise<Recommendation[]> {
  const { data } = await api.get('/recommendations', { params: { mode, limit } });
  return data.data || [];
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

export async function fetchSettings(): Promise<{
  mode: string;
  capital: number;
  chains: string[];
  thresholds: Record<string, number>;
  scoreWeights: Record<string, number>;
}> {
  const { data } = await api.get('/settings');
  return data.data;
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
