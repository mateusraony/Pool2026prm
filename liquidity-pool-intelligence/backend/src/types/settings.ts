import { Decimal } from 'decimal.js';

// Tipos para configurações do usuário

export type RiskProfile = 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE';

export interface SettingsData {
  id: number;
  totalBankroll: Decimal;
  riskProfile: RiskProfile;
  maxPercentPerPool: Decimal;
  maxPercentPerNetwork: Decimal;
  maxPercentVolatile: Decimal;
  enabledNetworks: string[];
  allowedPairTypes: string[];
  telegramChatId?: string;
  updatedAt: Date;
}

// Request para atualizar configurações
export interface UpdateSettingsRequest {
  totalBankroll?: number;
  riskProfile?: RiskProfile;
  maxPercentPerPool?: number;
  maxPercentPerNetwork?: number;
  maxPercentVolatile?: number;
  enabledNetworks?: string[];
  allowedPairTypes?: string[];
  telegramChatId?: string;
}

// Configurações de risco detalhadas baseadas no perfil
export interface RiskProfileConfig {
  profile: RiskProfile;
  description: string;
  // Ranges
  defensiveRangeWidth: number; // % do preço atual
  optimizedRangeWidth: number;
  aggressiveRangeWidth: number;
  // Limites
  maxPositionSize: number; // % da banca
  maxNetworkExposure: number; // % da banca
  maxVolatileExposure: number; // % da banca
  // Scores mínimos
  minScoreForRecommendation: number; // 0-100
  minTimeInRangeRequired: number; // %
  // IL tolerance
  maxILTolerance: number; // %
}

export const riskProfileConfigs: Record<RiskProfile, RiskProfileConfig> = {
  DEFENSIVE: {
    profile: 'DEFENSIVE',
    description: 'Prioriza segurança. Ranges mais largos, menos IL, menos fees.',
    defensiveRangeWidth: 30, // ±15%
    optimizedRangeWidth: 20, // ±10%
    aggressiveRangeWidth: 10, // ±5%
    maxPositionSize: 3,
    maxNetworkExposure: 20,
    maxVolatileExposure: 10,
    minScoreForRecommendation: 70,
    minTimeInRangeRequired: 90,
    maxILTolerance: 2,
  },
  NORMAL: {
    profile: 'NORMAL',
    description: 'Equilíbrio entre risco e retorno. Configuração padrão.',
    defensiveRangeWidth: 25, // ±12.5%
    optimizedRangeWidth: 15, // ±7.5%
    aggressiveRangeWidth: 8, // ±4%
    maxPositionSize: 5,
    maxNetworkExposure: 25,
    maxVolatileExposure: 20,
    minScoreForRecommendation: 60,
    minTimeInRangeRequired: 80,
    maxILTolerance: 5,
  },
  AGGRESSIVE: {
    profile: 'AGGRESSIVE',
    description: 'Maximiza retorno. Ranges mais estreitos, mais fees, mais IL.',
    defensiveRangeWidth: 20, // ±10%
    optimizedRangeWidth: 10, // ±5%
    aggressiveRangeWidth: 5, // ±2.5%
    maxPositionSize: 8,
    maxNetworkExposure: 35,
    maxVolatileExposure: 30,
    minScoreForRecommendation: 50,
    minTimeInRangeRequired: 70,
    maxILTolerance: 10,
  },
};

// Response da API
export interface SettingsResponse {
  settings: SettingsData;
  riskConfig: RiskProfileConfig;
  availableNetworks: string[];
  availablePairTypes: string[];
}
