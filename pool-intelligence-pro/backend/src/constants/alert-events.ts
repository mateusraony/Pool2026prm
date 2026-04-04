/**
 * Fonte única de verdade para tipos de alerta no backend.
 * SINCRONIZAR com: frontend/src/data/alert-events.ts
 *
 * Para adicionar um novo tipo:
 *   1. Adicione aqui em ALERT_TYPE_VALUES
 *   2. Adicione implementação em alert.service.ts (checkRule switch)
 *   3. Sincronize frontend/src/data/alert-events.ts
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

/** Metadados por tipo — usados em logs e mensagens do sistema */
export const ALERT_TYPE_META: Record<typeof ALERT_TYPE_VALUES[number], {
  description: string;
  implemented: boolean;
}> = {
  PRICE_ABOVE:        { description: 'Preço acima do limite',            implemented: true },
  PRICE_BELOW:        { description: 'Preço abaixo do limite',           implemented: true },
  VOLUME_DROP:        { description: 'Queda de volume acima do limiar',  implemented: true },
  LIQUIDITY_FLIGHT:   { description: 'Fuga de liquidez',                 implemented: true },
  VOLATILITY_SPIKE:   { description: 'Spike de volatilidade',            implemented: true },
  OUT_OF_RANGE:       { description: 'Preço saiu do range da posição',   implemented: true },
  NEAR_RANGE_EXIT:    { description: 'Preço próximo do limite do range', implemented: true },
  NEW_RECOMMENDATION: { description: 'Nova recomendação de IA',          implemented: true },
};
