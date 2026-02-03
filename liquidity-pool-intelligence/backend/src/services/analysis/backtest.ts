import { Decimal } from 'decimal.js';
import { PoolData, BacktestResult, RangeType, PricePoint } from '../../types/pool.js';
import {
  calculateImpermanentLoss,
  estimateDailyFees,
} from '../../utils/math.js';
import { log } from '../../utils/logger.js';

// ========================================
// BACKTEST SIMPLIFICADO
// ========================================

export interface BacktestParams {
  pool: PoolData;
  priceLower: Decimal;
  priceUpper: Decimal;
  capitalUsd: Decimal;
  period: '7d' | '30d';
}

// Executa backtest simplificado
export function runBacktest(params: BacktestParams): BacktestResult {
  const { pool, priceLower, priceUpper, capitalUsd, period } = params;
  const operation = log.startOperation('Run backtest', {
    poolId: pool.id,
    period,
  });

  const days = period === '7d' ? 7 : 30;
  const now = Date.now();
  const startTimestamp = now - days * 24 * 60 * 60 * 1000;

  // Filtra histórico de preços para o período
  const priceHistory = (pool.priceHistory || []).filter(
    p => p.timestamp * 1000 >= startTimestamp
  );

  // Se não há histórico suficiente, usa simulação
  if (priceHistory.length < 10) {
    log.warn('Insufficient price history, using simulation', {
      poolId: pool.id,
      dataPoints: priceHistory.length,
    });
    return simulateBacktest(params, days);
  }

  // Agrupa preços por dia
  const dailyData: {
    date: Date;
    inRange: boolean;
    avgPrice: Decimal;
    volume: Decimal;
    fees: Decimal;
    il: Decimal;
    cumulativePnL: Decimal;
  }[] = [];

  const dayMs = 24 * 60 * 60 * 1000;
  let cumulativeFees = new Decimal(0);
  let cumulativeIL = new Decimal(0);
  let rebalancesNeeded = 0;
  let timeInRange = 0;
  let totalTime = 0;

  // Processa cada dia
  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset--) {
    const dayStart = now - (dayOffset + 1) * dayMs;
    const dayEnd = now - dayOffset * dayMs;

    // Filtra preços do dia
    const dayPrices = priceHistory.filter(
      p => p.timestamp * 1000 >= dayStart && p.timestamp * 1000 < dayEnd
    );

    if (dayPrices.length === 0) {
      continue;
    }

    // Calcula métricas do dia
    const avgPrice = dayPrices.reduce(
      (sum, p) => sum.add(p.price),
      new Decimal(0)
    ).div(dayPrices.length);

    const dayVolume = dayPrices.reduce(
      (sum, p) => sum.add(p.volume || new Decimal(0)),
      new Decimal(0)
    );

    // Verifica se estava no range
    const inRange = avgPrice.gte(priceLower) && avgPrice.lte(priceUpper);

    if (inRange) {
      timeInRange++;
    } else {
      // Se saiu do range, conta como potencial rebalance
      if (dailyData.length > 0 && dailyData[dailyData.length - 1].inRange) {
        rebalancesNeeded++;
      }
    }
    totalTime++;

    // Calcula fees do dia (só se in-range)
    const rangeWidth = priceUpper.sub(priceLower).div(avgPrice).mul(100);
    const dayFees = inRange
      ? estimateDailyFees(
          pool.volume24hUsd,
          pool.tvlUsd,
          pool.feeTier,
          capitalUsd,
          rangeWidth
        )
      : new Decimal(0);

    cumulativeFees = cumulativeFees.add(dayFees);

    // Calcula IL do dia
    const dayIL = calculateImpermanentLoss(
      pool.currentPrice,
      avgPrice,
      priceLower,
      priceUpper
    ).mul(capitalUsd);

    // IL é a diferença vs dia anterior
    const previousIL = dailyData.length > 0
      ? dailyData[dailyData.length - 1].il
      : new Decimal(0);
    const ilDelta = dayIL.sub(previousIL);
    cumulativeIL = cumulativeIL.add(ilDelta.abs());

    const cumulativePnL = cumulativeFees.sub(cumulativeIL);

    dailyData.push({
      date: new Date(dayEnd),
      inRange,
      avgPrice,
      volume: dayVolume,
      fees: dayFees,
      il: dayIL,
      cumulativePnL,
    });
  }

  // Calcula métricas finais
  const totalFees = cumulativeFees;
  const totalIL = cumulativeIL;
  const netPnL = totalFees.sub(totalIL);
  const netPnLPercent = capitalUsd.gt(0)
    ? netPnL.div(capitalUsd).mul(100)
    : new Decimal(0);

  // Calcula max drawdown
  let maxDrawdown = new Decimal(0);
  let peak = new Decimal(0);
  for (const day of dailyData) {
    if (day.cumulativePnL.gt(peak)) {
      peak = day.cumulativePnL;
    }
    const drawdown = peak.sub(day.cumulativePnL);
    if (drawdown.gt(maxDrawdown)) {
      maxDrawdown = drawdown;
    }
  }
  const maxDrawdownPercent = capitalUsd.gt(0)
    ? maxDrawdown.div(capitalUsd).mul(100)
    : new Decimal(0);

  const timeInRangePercent = totalTime > 0
    ? new Decimal(timeInRange).div(totalTime).mul(100)
    : new Decimal(0);

  const result: BacktestResult = {
    poolId: pool.id,
    rangeType: determineRangeType(priceLower, priceUpper, pool.currentPrice),
    period,
    startDate: new Date(startTimestamp),
    endDate: new Date(now),
    metrics: {
      timeInRange: timeInRangePercent,
      totalFees,
      totalIL,
      netPnL,
      netPnLPercent,
      maxDrawdown: maxDrawdownPercent,
      rebalancesNeeded,
    },
    dailyData: dailyData.map(d => ({
      date: d.date,
      inRange: d.inRange,
      fees: d.fees,
      il: d.il,
      cumulativePnL: d.cumulativePnL,
    })),
  };

  operation.success('Backtest completed');
  return result;
}

// Simulação quando não há dados históricos suficientes
function simulateBacktest(params: BacktestParams, days: number): BacktestResult {
  const { pool, priceLower, priceUpper, capitalUsd, period } = params;

  // Simula com base na volatilidade estimada do par
  const volatility = pool.pairType === 'stable_stable' ? 0.5
    : pool.pairType === 'bluechip_stable' ? 3
    : 8; // % diário

  const rangeWidth = priceUpper.sub(priceLower).div(pool.currentPrice).mul(100);

  // Estima tempo no range baseado na volatilidade e largura do range
  const estimatedTimeInRange = Math.min(
    100,
    Math.max(50, rangeWidth.toNumber() / volatility * 10)
  );

  // Estima fees
  const dailyFees = estimateDailyFees(
    pool.volume24hUsd,
    pool.tvlUsd,
    pool.feeTier,
    capitalUsd,
    rangeWidth
  );

  const totalFees = dailyFees.mul(days).mul(estimatedTimeInRange / 100);

  // Estima IL baseada na volatilidade
  const estimatedPriceMove = new Decimal(volatility).mul(Math.sqrt(days)).div(100);
  const estimatedIL = calculateImpermanentLoss(
    pool.currentPrice,
    pool.currentPrice.mul(new Decimal(1).add(estimatedPriceMove)),
    priceLower,
    priceUpper
  ).mul(capitalUsd);

  const netPnL = totalFees.sub(estimatedIL);
  const netPnLPercent = capitalUsd.gt(0)
    ? netPnL.div(capitalUsd).mul(100)
    : new Decimal(0);

  return {
    poolId: pool.id,
    rangeType: determineRangeType(priceLower, priceUpper, pool.currentPrice),
    period,
    startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
    endDate: new Date(),
    metrics: {
      timeInRange: new Decimal(estimatedTimeInRange),
      totalFees,
      totalIL: estimatedIL,
      netPnL,
      netPnLPercent,
      maxDrawdown: estimatedIL.div(capitalUsd).mul(100),
      rebalancesNeeded: Math.floor((100 - estimatedTimeInRange) / 20),
    },
    dailyData: [], // Sem dados diários na simulação
  };
}

// Determina tipo de range baseado na largura
function determineRangeType(
  priceLower: Decimal,
  priceUpper: Decimal,
  currentPrice: Decimal
): RangeType {
  const width = priceUpper.sub(priceLower).div(currentPrice).mul(100);

  if (width.gt(20)) return 'DEFENSIVE';
  if (width.gt(10)) return 'OPTIMIZED';
  return 'AGGRESSIVE';
}

// Compara backtests de diferentes ranges
export function compareBacktests(
  backtests: BacktestResult[]
): {
  best: BacktestResult;
  comparison: {
    rangeType: RangeType;
    netReturn: Decimal;
    riskAdjustedReturn: Decimal; // Sharpe-like
    recommendation: string;
  }[];
} {
  const comparison = backtests.map(bt => {
    // Risk-adjusted return (simplificado)
    const riskAdjustedReturn = bt.metrics.maxDrawdown.gt(0)
      ? bt.metrics.netPnLPercent.div(bt.metrics.maxDrawdown)
      : bt.metrics.netPnLPercent;

    let recommendation = '';
    if (bt.metrics.netPnLPercent.gt(5)) {
      recommendation = 'Excelente retorno projetado';
    } else if (bt.metrics.netPnLPercent.gt(0)) {
      recommendation = 'Retorno positivo moderado';
    } else {
      recommendation = 'Retorno negativo - não recomendado';
    }

    return {
      rangeType: bt.rangeType,
      netReturn: bt.metrics.netPnLPercent,
      riskAdjustedReturn,
      recommendation,
    };
  });

  // Encontra o melhor por retorno ajustado ao risco
  const best = backtests.reduce((best, current) => {
    const bestRisk = best.metrics.maxDrawdown.gt(0)
      ? best.metrics.netPnLPercent.div(best.metrics.maxDrawdown)
      : best.metrics.netPnLPercent;
    const currentRisk = current.metrics.maxDrawdown.gt(0)
      ? current.metrics.netPnLPercent.div(current.metrics.maxDrawdown)
      : current.metrics.netPnLPercent;

    return currentRisk.gt(bestRisk) ? current : best;
  });

  return { best, comparison };
}
