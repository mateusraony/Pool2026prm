import { Decimal } from 'decimal.js';

// Tipos para posições de liquidez

export type PositionStatus = 'ACTIVE' | 'ATTENTION' | 'CRITICAL' | 'CLOSED';

export interface PositionData {
  id: string;
  poolId: string;
  tokenId?: string; // NFT ID se posição real
  walletAddress?: string;
  isSimulation: boolean;

  // Range
  priceLower: Decimal;
  priceUpper: Decimal;
  tickLower?: number;
  tickUpper?: number;

  // Capital
  capitalUsd: Decimal;
  liquidity?: string;

  // Tracking
  entryPrice?: Decimal;
  entryDate: Date;
  exitDate?: Date;
  status: PositionStatus;

  // Performance
  feesAccrued: Decimal;
  ilAccrued: Decimal;
  pnlUsd: Decimal;
  pnlPercent: Decimal;

  // Sync
  lastSyncAt?: Date;
  notes?: string;

  // Pool info (joined)
  pool?: {
    network: string;
    dex: string;
    token0Symbol: string;
    token1Symbol: string;
    feeTier: number;
    currentPrice: Decimal;
  };
}

// Posição on-chain (raw)
export interface OnChainPosition {
  tokenId: string;
  owner: string;
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  feeGrowthInside0LastX128: string;
  feeGrowthInside1LastX128: string;
  tokensOwed0: string;
  tokensOwed1: string;
}

// Resumo de posições
export interface PositionsSummary {
  totalPositions: number;
  activePositions: number;
  simulatedPositions: number;
  realPositions: number;
  totalCapitalUsd: Decimal;
  totalFeesAccrued: Decimal;
  totalILAccrued: Decimal;
  totalPnLUsd: Decimal;
  positionsByStatus: {
    active: number;
    attention: number;
    critical: number;
    closed: number;
  };
  positionsByNetwork: Record<string, number>;
}

// Request para criar/atualizar posição
export interface CreatePositionRequest {
  poolId: string;
  isSimulation: boolean;
  priceLower: number;
  priceUpper: number;
  capitalUsd: number;
  notes?: string;
  // Para posição real
  tokenId?: string;
  walletAddress?: string;
}

export interface UpdatePositionRequest {
  id: string;
  priceLower?: number;
  priceUpper?: number;
  capitalUsd?: number;
  status?: PositionStatus;
  notes?: string;
}

// Response da API
export interface PositionsResponse {
  positions: PositionData[];
  summary: PositionsSummary;
  lastSyncAt?: Date;
}

export interface PositionDetailResponse {
  position: PositionData;
  pool: {
    id: string;
    network: string;
    dex: string;
    token0Symbol: string;
    token1Symbol: string;
    feeTier: number;
    currentPrice: Decimal;
    tvlUsd: Decimal;
  };
  performance: {
    daysActive: number;
    timeInRange: Decimal; // %
    feesPerDay: Decimal;
    ilPerDay: Decimal;
    netPnLPerDay: Decimal;
    projectedMonthlyReturn: Decimal;
  };
  history: {
    action: string;
    details: Record<string, unknown>;
    createdAt: Date;
  }[];
}
