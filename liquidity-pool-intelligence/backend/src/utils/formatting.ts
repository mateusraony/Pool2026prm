import Decimal from 'decimal.js';

// ========================================
// FORMATAÇÃO DE NÚMEROS
// ========================================

// Formata valor em USD
export function formatUsd(value: Decimal | number, options?: {
  decimals?: number;
  compact?: boolean;
  showSign?: boolean;
}): string {
  const decimal = value instanceof Decimal ? value : new Decimal(value);
  const { decimals = 2, compact = false, showSign = false } = options || {};

  const sign = showSign && decimal.gt(0) ? '+' : '';

  if (compact) {
    const absValue = decimal.abs();
    if (absValue.gte(1e9)) {
      return `${sign}$${decimal.div(1e9).toFixed(decimals)}B`;
    }
    if (absValue.gte(1e6)) {
      return `${sign}$${decimal.div(1e6).toFixed(decimals)}M`;
    }
    if (absValue.gte(1e3)) {
      return `${sign}$${decimal.div(1e3).toFixed(decimals)}K`;
    }
  }

  return `${sign}$${decimal.toFixed(decimals)}`;
}

// Formata porcentagem
export function formatPercent(value: Decimal | number, options?: {
  decimals?: number;
  showSign?: boolean;
  multiply?: boolean; // se true, multiplica por 100
}): string {
  const decimal = value instanceof Decimal ? value : new Decimal(value);
  const { decimals = 2, showSign = false, multiply = false } = options || {};

  const finalValue = multiply ? decimal.mul(100) : decimal;
  const sign = showSign && finalValue.gt(0) ? '+' : '';

  return `${sign}${finalValue.toFixed(decimals)}%`;
}

// Formata número genérico
export function formatNumber(value: Decimal | number, decimals: number = 2): string {
  const decimal = value instanceof Decimal ? value : new Decimal(value);
  return decimal.toFixed(decimals);
}

// Formata preço de token (pode ter muitas casas decimais)
export function formatPrice(value: Decimal | number, options?: {
  significantDigits?: number;
  maxDecimals?: number;
}): string {
  const decimal = value instanceof Decimal ? value : new Decimal(value);
  const { significantDigits = 6, maxDecimals = 8 } = options || {};

  // Para preços muito pequenos, usa notação científica
  if (decimal.lt(0.000001)) {
    return decimal.toExponential(significantDigits - 1);
  }

  // Para preços normais, usa casas decimais apropriadas
  const integerPart = decimal.floor();
  if (integerPart.gte(1000)) {
    return decimal.toFixed(2);
  }
  if (integerPart.gte(1)) {
    return decimal.toFixed(4);
  }

  return decimal.toFixed(Math.min(maxDecimals, significantDigits));
}

// ========================================
// FORMATAÇÃO DE DATAS
// ========================================

// Formata data para exibição
export function formatDate(date: Date, format: 'short' | 'long' | 'relative' = 'short'): string {
  if (format === 'relative') {
    return formatRelativeTime(date);
  }

  const options: Intl.DateTimeFormatOptions = format === 'long'
    ? { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: '2-digit', day: '2-digit' };

  return date.toLocaleDateString('pt-BR', options);
}

// Formata tempo relativo
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'agora mesmo';
  if (diffMins < 60) return `${diffMins} min atrás`;
  if (diffHours < 24) return `${diffHours}h atrás`;
  if (diffDays < 7) return `${diffDays}d atrás`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} sem atrás`;

  return formatDate(date, 'short');
}

// ========================================
// FORMATAÇÃO DE POOLS E TOKENS
// ========================================

// Formata nome do par
export function formatPairName(token0: string, token1: string, feeTier?: number): string {
  const pair = `${token0}/${token1}`;
  if (feeTier) {
    return `${pair} ${formatFeeTier(feeTier)}`;
  }
  return pair;
}

// Formata fee tier
export function formatFeeTier(feeTier: number): string {
  return `${(feeTier / 10000).toFixed(2)}%`;
}

// Formata nome da rede
export function formatNetworkName(network: string): string {
  const names: Record<string, string> = {
    ethereum: 'Ethereum',
    arbitrum: 'Arbitrum',
    base: 'Base',
    polygon: 'Polygon',
    optimism: 'Optimism',
  };
  return names[network.toLowerCase()] || network;
}

// Formata nome da DEX
export function formatDexName(dex: string): string {
  const names: Record<string, string> = {
    uniswap_v3: 'Uniswap V3',
    sushiswap: 'SushiSwap',
    pancakeswap: 'PancakeSwap',
  };
  return names[dex.toLowerCase()] || dex;
}

// ========================================
// FORMATAÇÃO DE RANGES
// ========================================

// Formata range de preço
export function formatRange(lower: Decimal | number, upper: Decimal | number): string {
  const lowerDec = lower instanceof Decimal ? lower : new Decimal(lower);
  const upperDec = upper instanceof Decimal ? upper : new Decimal(upper);

  return `${formatPrice(lowerDec)} - ${formatPrice(upperDec)}`;
}

// Formata largura do range em %
export function formatRangeWidth(lower: Decimal | number, upper: Decimal | number): string {
  const lowerDec = lower instanceof Decimal ? lower : new Decimal(lower);
  const upperDec = upper instanceof Decimal ? upper : new Decimal(upper);

  const midpoint = lowerDec.add(upperDec).div(2);
  const width = upperDec.sub(lowerDec).div(midpoint).mul(100);

  return `±${width.div(2).toFixed(1)}%`;
}

// ========================================
// FORMATAÇÃO DE ALERTAS
// ========================================

// Formata nível de risco
export function formatRiskLevel(level: 'low' | 'medium' | 'high'): string {
  const labels: Record<string, string> = {
    low: '🟢 Baixo',
    medium: '🟡 Médio',
    high: '🔴 Alto',
  };
  return labels[level] || level;
}

// Formata status da posição
export function formatPositionStatus(status: string): string {
  const labels: Record<string, string> = {
    ACTIVE: '✅ Ativa',
    ATTENTION: '⚠️ Atenção',
    CRITICAL: '🚨 Crítico',
    CLOSED: '⏹️ Fechada',
  };
  return labels[status] || status;
}

// Formata severidade do alerta
export function formatAlertSeverity(severity: string): string {
  const labels: Record<string, string> = {
    INFO: 'ℹ️ Info',
    WARNING: '⚠️ Aviso',
    CRITICAL: '🚨 Crítico',
  };
  return labels[severity] || severity;
}

// ========================================
// FORMATAÇÃO PARA TELEGRAM
// ========================================

// Escapa caracteres especiais para HTML do Telegram
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Formata mensagem de alerta para Telegram
export function formatTelegramAlert(
  title: string,
  severity: string,
  details: Record<string, string | number>
): string {
  const severityEmoji: Record<string, string> = {
    INFO: 'ℹ️',
    WARNING: '⚠️',
    CRITICAL: '🚨',
  };

  let message = `${severityEmoji[severity] || ''} <b>${escapeHtml(title)}</b>\n\n`;

  for (const [key, value] of Object.entries(details)) {
    message += `<b>${escapeHtml(key)}:</b> ${escapeHtml(String(value))}\n`;
  }

  return message;
}
