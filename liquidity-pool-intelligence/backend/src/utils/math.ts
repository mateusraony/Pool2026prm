import Decimal from 'decimal.js';

// Configuração de precisão do Decimal.js
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

// ========================================
// FUNÇÕES DE PREÇO E TICK (Uniswap V3)
// ========================================

// Converte tick para preço
export function tickToPrice(tick: number, decimals0: number, decimals1: number): Decimal {
  const sqrtRatioX96 = new Decimal(1.0001).pow(tick / 2);
  const price = sqrtRatioX96.pow(2);
  const decimalAdjustment = new Decimal(10).pow(decimals0 - decimals1);
  return price.mul(decimalAdjustment);
}

// Converte preço para tick (aproximado)
export function priceToTick(price: Decimal, decimals0: number, decimals1: number): number {
  const decimalAdjustment = new Decimal(10).pow(decimals0 - decimals1);
  const adjustedPrice = price.div(decimalAdjustment);
  const tick = Decimal.log(adjustedPrice).div(Decimal.log(new Decimal(1.0001))).floor().toNumber();
  return tick;
}

// Arredonda tick para o espaçamento da pool (baseado na fee)
export function roundTickToSpacing(tick: number, feeTier: number): number {
  const spacing = getTickSpacing(feeTier);
  return Math.round(tick / spacing) * spacing;
}

// Obtém espaçamento de tick baseado na fee
export function getTickSpacing(feeTier: number): number {
  switch (feeTier) {
    case 100: return 1;
    case 500: return 10;
    case 3000: return 60;
    case 10000: return 200;
    default: return 60;
  }
}

// ========================================
// CÁLCULOS DE IMPERMANENT LOSS
// ========================================

// Calcula IL para um range concentrado
export function calculateImpermanentLoss(
  entryPrice: Decimal,
  currentPrice: Decimal,
  priceLower: Decimal,
  priceUpper: Decimal
): Decimal {
  // Se preço está fora do range, IL é calculada como se estivesse na borda
  let effectivePrice = currentPrice;
  if (currentPrice.lt(priceLower)) {
    effectivePrice = priceLower;
  } else if (currentPrice.gt(priceUpper)) {
    effectivePrice = priceUpper;
  }

  // Ratio de preço
  const priceRatio = effectivePrice.div(entryPrice);

  // Fórmula de IL para liquidez concentrada
  // IL = 2 * sqrt(priceRatio) / (1 + priceRatio) - 1
  const sqrtRatio = priceRatio.sqrt();
  const il = new Decimal(2).mul(sqrtRatio).div(new Decimal(1).add(priceRatio)).sub(1);

  // Retorna como valor positivo (perda)
  return il.abs();
}

// Simula IL para um cenário de preço
export function simulateIL(
  entryPrice: Decimal,
  scenarios: { price: Decimal; probability: Decimal }[],
  priceLower: Decimal,
  priceUpper: Decimal
): Decimal {
  let expectedIL = new Decimal(0);

  for (const scenario of scenarios) {
    const il = calculateImpermanentLoss(entryPrice, scenario.price, priceLower, priceUpper);
    expectedIL = expectedIL.add(il.mul(scenario.probability));
  }

  return expectedIL;
}

// ========================================
// ESTIMATIVA DE FEES
// ========================================

// Estima fees diárias para um range
export function estimateDailyFees(
  volume24hUsd: Decimal,
  tvlUsd: Decimal,
  feeTier: number,
  capitalUsd: Decimal,
  rangeWidth: Decimal, // % do preço total
  liquidityConcentration: Decimal = new Decimal(1) // multiplicador de concentração
): Decimal {
  // Fee tier em decimal (ex: 3000 -> 0.003)
  const feeRate = new Decimal(feeTier).div(1000000);

  // Fees totais da pool por dia
  const totalDailyFees = volume24hUsd.mul(feeRate);

  // Share base da pool
  const baseShare = capitalUsd.div(tvlUsd);

  // Ajuste por concentração do range
  // Range mais estreito = maior share das fees quando in-range
  const concentrationMultiplier = new Decimal(100).div(rangeWidth).mul(liquidityConcentration);

  // Share ajustada (limitada a um máximo razoável)
  const adjustedShare = Decimal.min(baseShare.mul(concentrationMultiplier), new Decimal(0.1));

  // Fees estimadas
  return totalDailyFees.mul(adjustedShare);
}

// ========================================
// CÁLCULOS DE RANGE
// ========================================

// Gera limites de range baseado em % do preço atual
export function calculateRangeBounds(
  currentPrice: Decimal,
  widthPercent: number
): { lower: Decimal; upper: Decimal } {
  const halfWidth = new Decimal(widthPercent).div(200); // metade, em decimal

  const lower = currentPrice.mul(new Decimal(1).sub(halfWidth));
  const upper = currentPrice.mul(new Decimal(1).add(halfWidth));

  return { lower, upper };
}

// Calcula % de tempo que o preço esteve dentro do range
export function calculateTimeInRange(
  priceHistory: { timestamp: number; price: Decimal }[],
  priceLower: Decimal,
  priceUpper: Decimal
): Decimal {
  if (priceHistory.length < 2) return new Decimal(0);

  let timeInRange = 0;
  let totalTime = 0;

  for (let i = 1; i < priceHistory.length; i++) {
    const prev = priceHistory[i - 1];
    const curr = priceHistory[i];
    const timeDelta = curr.timestamp - prev.timestamp;

    totalTime += timeDelta;

    // Verifica se o preço estava no range durante este período
    const avgPrice = prev.price.add(curr.price).div(2);
    if (avgPrice.gte(priceLower) && avgPrice.lte(priceUpper)) {
      timeInRange += timeDelta;
    }
  }

  return totalTime > 0
    ? new Decimal(timeInRange).div(totalTime).mul(100)
    : new Decimal(0);
}

// ========================================
// SCORE E RANKING
// ========================================

// Calcula score de um range (0-100)
export function calculateRangeScore(
  netReturn7d: Decimal, // % retorno líquido
  timeInRange: Decimal, // % tempo no range
  tvlUsd: Decimal,
  ilEstimate: Decimal,
  riskProfile: 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE'
): number {
  // Pesos baseados no perfil de risco
  const weights = {
    DEFENSIVE: { return: 30, stability: 40, safety: 30 },
    NORMAL: { return: 40, stability: 35, safety: 25 },
    AGGRESSIVE: { return: 50, stability: 30, safety: 20 },
  }[riskProfile];

  // Score de retorno (0-100)
  // 1% ao dia = 100, 0% = 0, negativo = 0
  const dailyReturn = netReturn7d.div(7);
  const returnScore = Decimal.max(
    new Decimal(0),
    Decimal.min(dailyReturn.mul(100), new Decimal(100))
  ).toNumber();

  // Score de estabilidade (tempo no range)
  const stabilityScore = Decimal.min(timeInRange, new Decimal(100)).toNumber();

  // Score de segurança (baseado em TVL e IL)
  // TVL > $10M = 100, < $100k = 0
  const tvlScore = Decimal.min(
    Decimal.max(tvlUsd.div(100000).sub(1).mul(10), new Decimal(0)),
    new Decimal(100)
  ).toNumber();

  // IL baixa = bom
  const ilScore = Decimal.max(
    new Decimal(100).sub(ilEstimate.mul(10)),
    new Decimal(0)
  ).toNumber();

  const safetyScore = (tvlScore + ilScore) / 2;

  // Score final ponderado
  const finalScore =
    (returnScore * weights.return / 100) +
    (stabilityScore * weights.stability / 100) +
    (safetyScore * weights.safety / 100);

  return Math.round(Decimal.min(new Decimal(finalScore), new Decimal(100)).toNumber());
}

// ========================================
// UTILIDADES GERAIS
// ========================================

// Formata Decimal para exibição
export function formatDecimal(value: Decimal, decimals: number = 2): string {
  return value.toFixed(decimals);
}

// Converte para porcentagem
export function toPercent(value: Decimal, decimals: number = 2): string {
  return value.mul(100).toFixed(decimals) + '%';
}

// Converte basis points para porcentagem
export function bpsToPercent(bps: number): string {
  return (bps / 100).toFixed(2) + '%';
}

// Calcula variação percentual
export function percentChange(oldValue: Decimal, newValue: Decimal): Decimal {
  if (oldValue.isZero()) return new Decimal(0);
  return newValue.sub(oldValue).div(oldValue).mul(100);
}
