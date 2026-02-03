import axios, { AxiosError } from 'axios';

// Cliente HTTP configurado
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor de resposta para tratamento de erros
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response) {
      // Erro do servidor
      console.error('API Error:', error.response.status, error.response.data);
    } else if (error.request) {
      // Erro de rede
      console.error('Network Error:', error.message);
    }
    return Promise.reject(error);
  }
);

// ========================================
// TIPOS
// ========================================

export interface Pool {
  id: string;
  network: string;
  dex: string;
  token0Symbol: string;
  token1Symbol: string;
  feeTier: number;
  tvlUsd: number;
  volume24hUsd: number;
  volume7dUsd: number;
  currentPrice: string;
  aprEstimate: number | null;
  pairType: string;
  lastScannedAt: string;
}

export interface PoolRange {
  rangeType: 'DEFENSIVE' | 'OPTIMIZED' | 'AGGRESSIVE';
  priceLower: string;
  priceUpper: string;
  score: number;
  feesEstimate7d: number;
  ilEstimate7d: number;
  gasEstimate: number;
  netReturn7d: number;
  timeInRange7d: number;
  capitalPercent: number;
  capitalUsd: number;
  riskLevel: 'low' | 'medium' | 'high';
  explanation: string;
}

export interface RecommendedPool {
  pool: Pool;
  ranges: PoolRange[];
  bestRange: {
    rangeType: string;
    score: number;
    netReturn7d: number;
    capitalUsd: number;
    riskLevel: string;
  } | null;
  overallScore: number;
}

export interface Position {
  id: string;
  poolId: string;
  isSimulation: boolean;
  priceLower: string;
  priceUpper: string;
  capitalUsd: number;
  status: 'ACTIVE' | 'ATTENTION' | 'CRITICAL' | 'CLOSED';
  feesAccrued: number;
  ilAccrued: number;
  pnlUsd: number;
  entryDate: string;
  pool: {
    network: string;
    token0Symbol: string;
    token1Symbol: string;
    feeTier: number;
    currentPrice: string;
  };
}

export interface Alert {
  id: string;
  type: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  sentAt: string;
  acknowledged: boolean;
}

export interface Settings {
  totalBankroll: number;
  riskProfile: 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE';
  maxPercentPerPool: number;
  maxPercentPerNetwork: number;
  maxPercentVolatile: number;
  enabledNetworks: string[];
  allowedPairTypes: string[];
  telegramChatId: string | null;
}

export interface DashboardData {
  settings: {
    totalBankroll: number;
    riskProfile: string;
    enabledNetworks: string[];
  } | null;
  portfolio: {
    totalCapitalDeployed: number;
    totalPnL: number;
    totalFeesAccrued: number;
    activePositions: number;
    positionsNeedingAttention: number;
  };
  positions: {
    id: string;
    poolId: string;
    network: string;
    pair: string;
    capitalUsd: number;
    pnlUsd: number;
    status: string;
    isSimulation: boolean;
  }[];
  alerts: {
    id: string;
    type: string;
    severity: string;
    title: string;
    sentAt: string;
  }[];
  opportunities: {
    poolId: string;
    network: string;
    pair: string;
    score: number;
    netReturn7d: number;
    tvlUsd: number;
  }[];
}

// ========================================
// API FUNCTIONS
// ========================================

// Dashboard
export async function fetchDashboard(): Promise<DashboardData> {
  const { data } = await api.get('/dashboard');
  return data;
}

// Pools
export async function fetchRecommendedPools(params?: {
  network?: string;
  pairType?: string;
  limit?: number;
}): Promise<{ pools: RecommendedPool[]; totalCount: number }> {
  const { data } = await api.get('/pools/recommended', { params });
  return data;
}

export async function fetchPoolDetail(id: string): Promise<{
  pool: Pool & { address: string };
  ranges: PoolRange[];
  liquidityChart: { tickIdx: number; price: string; liquidityGross: string }[];
  hasActivePosition: boolean;
}> {
  const { data } = await api.get(`/pools/${encodeURIComponent(id)}`);
  return data;
}

export async function runBacktest(
  poolId: string,
  params: { priceLower: number; priceUpper: number; capitalUsd: number; period?: string }
): Promise<{
  backtest: {
    metrics: {
      timeInRange: number;
      totalFees: number;
      totalIL: number;
      netPnL: number;
      netPnLPercent: number;
      maxDrawdown: number;
      rebalancesNeeded: number;
    };
  };
}> {
  const { data } = await api.post(`/pools/${encodeURIComponent(poolId)}/backtest`, params);
  return data;
}

// Positions
export async function fetchPositions(params?: {
  status?: string;
  isSimulation?: boolean;
}): Promise<{
  positions: Position[];
  summary: {
    totalPositions: number;
    activePositions: number;
    simulatedPositions: number;
    realPositions: number;
    totalCapitalUsd: number;
    totalFeesAccrued: number;
    totalILAccrued: number;
    totalPnLUsd: number;
  };
}> {
  const { data } = await api.get('/positions', { params });
  return data;
}

export async function createPosition(params: {
  poolId: string;
  isSimulation: boolean;
  priceLower: number;
  priceUpper: number;
  capitalUsd: number;
}): Promise<{ position: Position }> {
  const { data } = await api.post('/positions', params);
  return data;
}

export async function updatePosition(
  id: string,
  params: { status?: string; notes?: string }
): Promise<{ position: Position }> {
  const { data } = await api.put(`/positions/${id}`, params);
  return data;
}

export async function closePosition(id: string): Promise<{ position: Position }> {
  const { data } = await api.put(`/positions/${id}`, { status: 'CLOSED' });
  return data;
}

// Settings
export async function fetchSettings(): Promise<{
  settings: Settings;
  riskConfig: object;
  availableNetworks: string[];
  availablePairTypes: string[];
}> {
  const { data } = await api.get('/settings');
  return data;
}

export async function updateSettings(params: Partial<Settings>): Promise<{ settings: Settings }> {
  const { data } = await api.put('/settings', params);
  return data;
}

// Alerts
export async function fetchAlerts(params?: {
  type?: string;
  acknowledged?: boolean;
}): Promise<{ alerts: Alert[]; unacknowledgedCount: number }> {
  const { data } = await api.get('/alerts', { params });
  return data;
}

export async function acknowledgeAlert(id: string): Promise<void> {
  await api.put(`/alerts/${id}/acknowledge`);
}

// History
export async function fetchHistory(params?: {
  poolId?: string;
  action?: string;
  network?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<{
  history: {
    id: string;
    poolId: string;
    action: string;
    details: Record<string, unknown>;
    createdAt: string;
    pool: { network: string; token0Symbol: string; token1Symbol: string };
  }[];
  pagination: { total: number; hasMore: boolean };
}> {
  const { data } = await api.get('/history', { params });
  return data;
}

// Health
export async function checkHealth(): Promise<{ status: string }> {
  const { data } = await api.get('/health');
  return data;
}

export default api;
