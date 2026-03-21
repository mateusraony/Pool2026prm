/**
 * Fonte única de verdade para tipos de alerta no frontend.
 * SINCRONIZAR com: backend/src/constants/alert-events.ts
 *
 * Para adicionar um novo tipo:
 *   1. Adicione aqui em ALERT_TYPE_VALUES e em alertTypeConfig
 *   2. Sincronize backend/src/constants/alert-events.ts
 *   3. Garanta implementação em backend/src/services/alert.service.ts
 */

export const ALERT_TYPE_VALUES = [
  'PRICE_ABOVE',
  'PRICE_BELOW',
  'VOLUME_DROP',
  'LIQUIDITY_FLIGHT',
  'VOLATILITY_SPIKE',
  'OUT_OF_RANGE',
  'NEAR_RANGE_EXIT',
  'NEW_RECOMMENDATION',
] as const;

export type AlertType = typeof ALERT_TYPE_VALUES[number];

export const alertTypeConfig: Record<AlertType, {
  label: string;
  icon: string;
  unit: string;
  description: string;
}> = {
  PRICE_ABOVE:        { label: 'Preço Acima',               icon: '📈', unit: '$',  description: 'Notificar quando preço subir acima do valor' },
  PRICE_BELOW:        { label: 'Preço Abaixo',              icon: '📉', unit: '$',  description: 'Notificar quando preço cair abaixo do valor' },
  VOLUME_DROP:        { label: 'Queda de Volume',           icon: '📊', unit: '%',  description: 'Notificar quando volume cair mais que o limiar' },
  LIQUIDITY_FLIGHT:   { label: 'Fuga de Liquidez',          icon: '💧', unit: '%',  description: 'Notificar quando TVL cair mais que o limiar' },
  VOLATILITY_SPIKE:   { label: 'Spike de Volatilidade',     icon: '⚡', unit: '%',  description: 'Notificar quando volatilidade disparar' },
  OUT_OF_RANGE:       { label: 'Fora do Range',             icon: '📍', unit: '%',  description: 'Notificar quando preço sair do range da posição' },
  NEAR_RANGE_EXIT:    { label: 'Próximo de Sair do Range',  icon: '⚠️', unit: '%',  description: 'Notificar quando preço se aproximar do limite do range' },
  NEW_RECOMMENDATION: { label: 'Nova Recomendação',         icon: '🎯', unit: '',   description: 'Notificar quando nova recomendação de pool aparecer' },
};

/** Lista plana para uso em selects, filtros e badges de UI */
export const ALERT_EVENTS_LIST = ALERT_TYPE_VALUES.map(type => ({
  value: type,
  label: alertTypeConfig[type].label,
}));
