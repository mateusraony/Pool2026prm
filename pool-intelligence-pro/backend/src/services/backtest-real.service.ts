/**
 * Backtesting de posições V3 usando dados reais do TheGraph.
 * Inspirado no revert-backtester (https://github.com/revert-finance/revert-backtester).
 * Em vez de simulação GBM sintética, usa poolHourData on-chain real.
 */
import axios from 'axios';
import { logService } from './log.service.js';
import { calcIL, PoolType } from './calc.service.js';

// ============================================================
// SUBGRAPH ENDPOINTS (espelha thegraph.adapter.ts)
// ============================================================

const SUBGRAPH_IDS: Record<string, string> = {
  ethereum: 'ELUcwgpm14LKPLrBRuVvPvNKHQ9HvwmtKgKSH855M4Np',
  arbitrum: 'FbCGRftH4a3yZugY7TnbYgPJVEv2LvMT6oF1fxPe9aH',
  base: 'GqzP4Xaehti8KSfQmv3ZctFSjnSUYZ4En5NRsiTbvZpz',
  polygon: '3hCPRGf4z88VC5rsBKU5AA9FBBq5nF3jbKJG7VZCDqm9',
};

function getEndpoint(chain: string): string | null {
  const apiKey = process.env.THEGRAPH_API_KEY;
  if (!apiKey) return null;
  const id = SUBGRAPH_IDS[chain];
  if (!id) return null;
  return `https://gateway-arbitrum.network.thegraph.com/api/${apiKey}/subgraphs/id/${id}`;
}

// ============================================================
// TIPOS PÚBLICOS
// ============================================================

export interface RealBacktestParams {
  chain: string;
  address: string;
  rangeLower: number;
  rangeUpper: number;
  capital: number;
  days: 7 | 14 | 30 | 90;
  feeTier?: number; // decimal (ex: 0.003)
}

export interface RealBacktestSnapshot {
  timestamp: number;
  price: number;
  inRange: boolean;
  feesAccum: number;
  ilAccum: number;
}

export interface RealBacktestResult {
  source: 'thegraph' | 'unavailable';
  dataPoints: number;
  periodDays: number;
  apr: number;
  ilPercent: number;
  feesEarned: number;
  timeInRangePct: number;
  pnlPercent: number;
  priceStart: number;
  priceEnd: number;
  priceMin: number;
  priceMax: number;
  hourlySnapshots: RealBacktestSnapshot[];
}

// ============================================================
// GRAPHQL QUERY
// ============================================================

const POOL_HOUR_DATA_QUERY = `
  query PoolHourData($poolId: String!, $first: Int!, $skip: Int!) {
    poolHourDatas(
      first: $first
      skip: $skip
      orderBy: periodStartUnix
      orderDirection: asc
      where: { pool: $poolId }
    ) {
      periodStartUnix
      token0Price
      volumeUSD
      feesUSD
    }
  }
`;

interface PoolHourDataItem {
  periodStartUnix: number;
  token0Price: string;
  volumeUSD: string;
  feesUSD: string;
}

interface PoolHourDataResponse {
  poolHourDatas: PoolHourDataItem[];
}

// ============================================================
// FETCH PAGINADO
// ============================================================

async function fetchPoolHourData(
  chain: string,
  address: string,
  targetHours: number
): Promise<PoolHourDataItem[]> {
  const endpoint = getEndpoint(chain);
  if (!endpoint) {
    logService.warn('BACKTEST', 'TheGraph endpoint indisponível (sem API key ou chain não suportada)', { chain });
    return [];
  }

  const pageSize = 1000;
  const pages = Math.ceil(targetHours / pageSize);
  const allData: PoolHourDataItem[] = [];

  for (let page = 0; page < pages; page++) {
    const skip = page * pageSize;
    const first = Math.min(pageSize, targetHours - skip);

    try {
      const response = await axios.post<{ data?: PoolHourDataResponse; errors?: { message: string }[] }>(
        endpoint,
        {
          query: POOL_HOUR_DATA_QUERY,
          variables: {
            poolId: address.toLowerCase(),
            first,
            skip,
          },
        },
        {
          timeout: 20000,
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (response.data?.errors?.length) {
        logService.warn('BACKTEST', `GraphQL error na página ${page}`, {
          chain, address, error: response.data.errors[0]?.message,
        });
        break;
      }

      const items = response.data?.data?.poolHourDatas;
      if (!items?.length) break;

      allData.push(...items);

      // Última página se retornou menos que o solicitado
      if (items.length < first) break;
    } catch (err) {
      logService.warn('BACKTEST', `Erro HTTP ao buscar página ${page} do TheGraph`, { chain, address, err: String(err) });
      break;
    }
  }

  return allData;
}

// ============================================================
// BACKTEST PRINCIPAL
// ============================================================

export async function calcRealBacktest(params: RealBacktestParams): Promise<RealBacktestResult> {
  const { chain, address, rangeLower, rangeUpper, capital, days, feeTier = 0.003 } = params;
  const targetHours = days * 24;

  const unavailable: RealBacktestResult = {
    source: 'unavailable',
    dataPoints: 0,
    periodDays: days,
    apr: 0,
    ilPercent: 0,
    feesEarned: 0,
    timeInRangePct: 0,
    pnlPercent: 0,
    priceStart: 0,
    priceEnd: 0,
    priceMin: 0,
    priceMax: 0,
    hourlySnapshots: [],
  };

  try {
    const rawData = await fetchPoolHourData(chain, address, targetHours);

    if (!rawData || rawData.length < 24) {
      logService.warn('BACKTEST', 'Dados insuficientes do TheGraph (<24h)', {
        chain, address, got: rawData?.length ?? 0,
      });
      return unavailable;
    }

    // Pegar apenas os últimos targetHours pontos
    const data = rawData.slice(-targetHours);
    const prices = data
      .map(d => parseFloat(d.token0Price))
      .filter(p => p > 0 && isFinite(p));

    if (prices.length === 0) return unavailable;

    const priceStart = prices[0];
    const priceEnd = prices[prices.length - 1];
    const priceMin = Math.min(...prices);
    const priceMax = Math.max(...prices);

    let hoursInRange = 0;
    const snapshots: RealBacktestSnapshot[] = [];
    let runningFeesAccum = 0;

    for (let i = 0; i < data.length; i++) {
      const price = parseFloat(data[i].token0Price);
      if (!price || price <= 0 || !isFinite(price)) continue;

      const inRange = price >= rangeLower && price <= rangeUpper;

      if (inRange) {
        hoursInRange++;
      }

      // IL acumulado ponto-a-ponto em relação ao preço de entrada
      const ilResult = priceStart > 0
        ? calcIL({ entryPrice: priceStart, currentPrice: price, rangeLower, rangeUpper, poolType: 'CL' as PoolType })
        : { ilPercent: 0 };

      snapshots.push({
        timestamp: Number(data[i].periodStartUnix) * 1000,
        price,
        inRange,
        feesAccum: Math.round(runningFeesAccum * 100) / 100,
        ilAccum: Math.round(ilResult.ilPercent * 100) / 100,
      });
    }

    const timeInRangePct = data.length > 0 ? (hoursInRange / data.length) * 100 : 0;

    // Fees totais: usar feesUSD real do TheGraph; fallback para volume × feeTier
    const totalFeesUSD = data.reduce((sum, d) => sum + (parseFloat(d.feesUSD) || 0), 0);
    const totalVolumeUSD = data.reduce((sum, d) => sum + (parseFloat(d.volumeUSD) || 0), 0);

    // Taxa de fee efetiva do período
    const periodFeeRate = totalVolumeUSD > 0 ? totalFeesUSD / totalVolumeUSD : feeTier;

    // Fees ganhas: proporcional ao capital, tempo in-range e duração do período
    // (assume share de liquidez uniforme — simplificação conservadora sem TVL)
    const periodYears = data.length / 8760;
    const feesEarned = capital * periodFeeRate * (timeInRangePct / 100) * (data.length / 8760);

    // Atualizar feesAccum acumulado nos snapshots de forma linear
    if (snapshots.length > 0) {
      const feePerHourInRange = hoursInRange > 0 ? feesEarned / hoursInRange : 0;
      let cumFees = 0;
      for (const snap of snapshots) {
        if (snap.inRange) {
          cumFees += feePerHourInRange;
        }
        snap.feesAccum = Math.round(cumFees * 100) / 100;
      }
    }

    // IL final (preço de entrada vs preço final)
    const ilResult = calcIL({
      entryPrice: priceStart,
      currentPrice: priceEnd,
      rangeLower,
      rangeUpper,
      poolType: 'CL' as PoolType,
    });
    const ilPercent = ilResult.ilPercent;

    // APR anualizado
    const apr = periodYears > 0 ? (feesEarned / capital) / periodYears * 100 : 0;
    const pnlPercent = (feesEarned / capital) * 100 + ilPercent;

    logService.info('BACKTEST', 'Backtest real concluído', {
      chain,
      address,
      dataPoints: data.length,
      apr: apr.toFixed(2),
      timeInRangePct: timeInRangePct.toFixed(1),
    });

    return {
      source: 'thegraph',
      dataPoints: data.length,
      periodDays: days,
      apr: Math.round(apr * 100) / 100,
      ilPercent: Math.round(ilPercent * 100) / 100,
      feesEarned: Math.round(feesEarned * 100) / 100,
      timeInRangePct: Math.round(timeInRangePct * 10) / 10,
      pnlPercent: Math.round(pnlPercent * 100) / 100,
      priceStart,
      priceEnd,
      priceMin,
      priceMax,
      // Limitar snapshots para não explodir o JSON
      hourlySnapshots: snapshots.slice(0, 500),
    };
  } catch (err) {
    logService.error('BACKTEST', 'Erro no backtest real', { chain, address, err: String(err) });
    return unavailable;
  }
}
