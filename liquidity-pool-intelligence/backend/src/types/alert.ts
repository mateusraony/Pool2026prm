import { Decimal } from 'decimal.js';

// Tipos para alertas

export type AlertType = 'MAINTENANCE' | 'RISK' | 'OPPORTUNITY';
export type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface AlertData {
  id: string;
  poolId?: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  data?: AlertPayload;
  sentAt: Date;
  acknowledged: boolean;

  // Pool info (joined)
  pool?: {
    network: string;
    token0Symbol: string;
    token1Symbol: string;
    feeTier: number;
  };
}

// Payloads específicos por tipo de alerta
export type AlertPayload =
  | OutOfRangePayload
  | TvlDropPayload
  | AprDropPayload
  | NewOpportunityPayload
  | GasHighPayload
  | RebalanceNeededPayload;

export interface OutOfRangePayload {
  type: 'OUT_OF_RANGE';
  currentPrice: Decimal;
  rangeLower: Decimal;
  rangeUpper: Decimal;
  percentOutside: number;
  direction: 'above' | 'below';
  capitalAtRisk: Decimal;
  recommendation: 'hold' | 'rebalance' | 'exit';
}

export interface TvlDropPayload {
  type: 'TVL_DROP';
  previousTvl: Decimal;
  currentTvl: Decimal;
  dropPercent: number;
  recommendation: 'monitor' | 'reduce' | 'exit';
}

export interface AprDropPayload {
  type: 'APR_DROP';
  previousApr: Decimal;
  currentApr: Decimal;
  minimumRequired: number;
  recommendation: 'hold' | 'exit' | 'migrate';
}

export interface NewOpportunityPayload {
  type: 'NEW_OPPORTUNITY';
  poolId: string;
  poolName: string;
  network: string;
  score: number;
  projectedReturn: Decimal;
  suggestedCapital: Decimal;
}

export interface GasHighPayload {
  type: 'GAS_HIGH';
  network: string;
  currentGasGwei: number;
  normalGasGwei: number;
  estimatedCostUsd: Decimal;
  recommendation: 'wait' | 'proceed';
}

export interface RebalanceNeededPayload {
  type: 'REBALANCE_NEEDED';
  currentRange: { lower: Decimal; upper: Decimal };
  suggestedRange: { lower: Decimal; upper: Decimal };
  expectedImprovement: Decimal;
  estimatedGasCost: Decimal;
  worthIt: boolean;
}

// Configurações de alertas
export interface AlertConfig {
  enabled: boolean;
  // Manutenção
  outOfRangePercent: number; // % fora do range
  outOfRangeDelay: number; // minutos antes de alertar
  // Risco
  tvlDropPercent: number; // % queda TVL
  aprMinimum: number; // APR mínimo
  // Oportunidade
  opportunityMinScore: number; // score mínimo
  opportunityMinImprovement: number; // % melhoria vs atual
  // Frequência
  maxAlertsPerHour: number;
  quietHoursStart?: number; // 0-23
  quietHoursEnd?: number; // 0-23
}

export const defaultAlertConfig: AlertConfig = {
  enabled: true,
  outOfRangePercent: 5,
  outOfRangeDelay: 15,
  tvlDropPercent: 20,
  aprMinimum: 5,
  opportunityMinScore: 75,
  opportunityMinImprovement: 20,
  maxAlertsPerHour: 10,
};

// Response da API
export interface AlertsResponse {
  alerts: AlertData[];
  unacknowledgedCount: number;
  lastAlertAt?: Date;
}

// Formato de mensagem do Telegram
export interface TelegramMessage {
  chatId: string;
  text: string;
  parseMode: 'HTML' | 'Markdown';
  disableWebPagePreview?: boolean;
  replyMarkup?: {
    inline_keyboard: {
      text: string;
      url?: string;
      callback_data?: string;
    }[][];
  };
}
