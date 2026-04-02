/**
 * Price History Service — ETAPA 15
 * Busca dados OHLCV reais da GeckoTerminal API com cache.
 * Fallback: gera candles sintéticos a partir de preço/volatilidade da pool.
 * Timeframes: day, hour, minute.
 */

import { fetchWithRetry } from './retry.service.js';
import { cacheService } from './cache.service.js';
import { logService } from './log.service.js';

const GECKO_BASE = 'https://api.geckoterminal.com/api/v2';

const CHAIN_MAP: Record<string, string> = {
  ethereum: 'eth',
  arbitrum: 'arbitrum',
  base: 'base',
  polygon: 'polygon_pos',
  optimism: 'optimism',
  bsc: 'bsc',
  avalanche: 'avax',
};

export type OhlcvTimeframe = 'day' | 'hour' | 'minute';

export interface OhlcvCandle {
  timestamp: number;   // Unix ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OhlcvResult {
  chain: string;
  address: string;
  timeframe: OhlcvTimeframe;
  candles: OhlcvCandle[];
  currency: 'usd';
  token: 'base' | 'quote';
  fetchedAt: string;
  synthetic?: boolean;
}

function getGeckoNetwork(chain: string): string {
  const normalized = chain.toLowerCase().trim();
  return CHAIN_MAP[normalized] ?? normalized;
}

// Cache TTL por timeframe (segundos)
const CACHE_TTL: Record<OhlcvTimeframe, number> = {
  minute: 60,
  hour: 300,
  day: 900,
};

// Limites máximos por timeframe
const MAX_LIMIT: Record<OhlcvTimeframe, number> = {
  minute: 720,
  hour: 720,
  day: 365,
};

interface GeckoOhlcvResponse {
  data?: {
    attributes?: {
      ohlcv_list?: [number, number, number, number, number, number][];
    };
  };
}

/**
 * Gera candles sintéticos baseados em random walk com mean-reversion.
 * Usado quando GeckoTerminal não retorna dados para a pool.
 */
function generateSyntheticCandles(
  currentPrice: number,
  volatilityAnn: number,
  timeframe: OhlcvTimeframe,
  limit: number,
  volume24h: number,
): OhlcvCandle[] {
  const safePrice = currentPrice > 0 ? currentPrice : 1;
  const vol = volatilityAnn > 0 ? volatilityAnn : 0.5;
  const now = Date.now();

  // Intervalo em ms por candle
  const intervalMs: Record<OhlcvTimeframe, number> = {
    minute: 60 * 1000,
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
  };
  const step = intervalMs[timeframe];

  // Volatilidade por candle: σ_annual * sqrt(dt/year)
  const dtYears = step / (365.25 * 24 * 60 * 60 * 1000);
  const volPerCandle = vol * Math.sqrt(dtYears);

  // Seed determinístico baseado no preço (mesma pool → mesma linha)
  let seed = Math.abs(Math.round(safePrice * 100000)) % 2147483647;
  if (seed === 0) seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  // Volume médio por candle
  const candlesPerDay = (24 * 60 * 60 * 1000) / step;
  const avgVolPerCandle = Math.max(1000, volume24h / candlesPerDay);

  const candles: OhlcvCandle[] = [];
  let price = safePrice * (1 + (rand() - 0.5) * vol * 0.3);

  for (let i = 0; i < limit; i++) {
    const t = now - (limit - i) * step;
    // Random walk com mean reversion para currentPrice
    const drift = (safePrice - price) * 0.03;
    const shock = (rand() - 0.5) * 2 * price * volPerCandle;
    const open = price;
    price = Math.max(safePrice * 0.3, price + drift + shock);
    const close = price;
    const high = Math.max(open, close) * (1 + rand() * volPerCandle * 0.5);
    const low = Math.min(open, close) * (1 - rand() * volPerCandle * 0.5);
    const volume = avgVolPerCandle * (0.3 + rand() * 1.4);

    candles.push({ timestamp: t, open, high, low, close, volume });
  }

  // Último candle termina no preço atual
  if (candles.length > 0) {
    candles[candles.length - 1].close = safePrice;
  }

  return candles;
}

class PriceHistoryService {
  /**
   * Busca candles OHLCV para uma pool.
   * Tenta GeckoTerminal primeiro; se falhar, gera candles sintéticos.
   */
  async getOhlcv(
    chain: string,
    address: string,
    timeframe: OhlcvTimeframe = 'hour',
    limit = 168,
    token: 'base' | 'quote' = 'base'
  ): Promise<OhlcvResult | null> {
    const network = getGeckoNetwork(chain);
    const clampedLimit = Math.min(limit, MAX_LIMIT[timeframe]);
    const cacheKey = `ohlcv:${network}:${address}:${timeframe}:${clampedLimit}:${token}`;

    const cached = cacheService.get<OhlcvResult>(cacheKey);
    if (cached.data) return cached.data;

    try {
      const url =
        `${GECKO_BASE}/networks/${network}/pools/${address}/ohlcv/${timeframe}` +
        `?limit=${clampedLimit}&currency=usd&token=${token}`;

      const data = await fetchWithRetry<GeckoOhlcvResponse>(
        'geckoterminal-ohlcv',
        () =>
          fetch(url, {
            headers: { Accept: 'application/json;version=20230302' },
          }).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json() as Promise<GeckoOhlcvResponse>;
          }),
        'POOLS'
      );

      const ohlcvList = data?.data?.attributes?.ohlcv_list;
      if (!Array.isArray(ohlcvList) || ohlcvList.length === 0) {
        logService.warn('POOLS', 'Empty OHLCV from GeckoTerminal, will use fallback', { chain, address, timeframe });
        return null; // Caller can use getOhlcvWithFallback
      }

      const candles: OhlcvCandle[] = ohlcvList.map(([ts, o, h, l, c, v]) => ({
        timestamp: ts * 1000, // GeckoTerminal retorna segundos → ms
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v,
      }));

      // GeckoTerminal retorna ordem decrescente — reverter para cronológico
      candles.reverse();

      const result: OhlcvResult = {
        chain,
        address,
        timeframe,
        candles,
        currency: 'usd',
        token,
        fetchedAt: new Date().toISOString(),
      };

      cacheService.set(cacheKey, result, CACHE_TTL[timeframe]);
      logService.info('POOLS', `OHLCV fetched: ${candles.length} candles`, { chain, address, timeframe });

      return result;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logService.error('POOLS', `OHLCV fetch failed: ${msg}`, { chain, address, timeframe });
      return null;
    }
  }

  /**
   * Busca OHLCV com fallback sintético quando GeckoTerminal não tem dados.
   * Usado pelos endpoints que precisam SEMPRE retornar algo.
   */
  async getOhlcvWithFallback(
    chain: string,
    address: string,
    timeframe: OhlcvTimeframe = 'hour',
    limit = 168,
    token: 'base' | 'quote' = 'base',
    poolPrice = 0,
    poolVolatility = 0.5,
    poolVolume24h = 50000,
  ): Promise<OhlcvResult> {
    const real = await this.getOhlcv(chain, address, timeframe, limit, token);
    if (real && real.candles.length > 0) return real;

    // Fallback: gerar candles sintéticos
    const clampedLimit = Math.min(limit, MAX_LIMIT[timeframe]);
    const candles = generateSyntheticCandles(poolPrice, poolVolatility, timeframe, clampedLimit, poolVolume24h);

    logService.info('POOLS', `Synthetic OHLCV generated: ${candles.length} candles`, { chain, address, timeframe });

    return {
      chain,
      address,
      timeframe,
      candles,
      currency: 'usd',
      token,
      fetchedAt: new Date().toISOString(),
      synthetic: true,
    };
  }

  /**
   * Múltiplos timeframes em paralelo (pré-carregamento).
   */
  async getMultiTimeframe(
    chain: string,
    address: string
  ): Promise<{ hour: OhlcvResult | null; day: OhlcvResult | null }> {
    const [hour, day] = await Promise.all([
      this.getOhlcv(chain, address, 'hour', 168),
      this.getOhlcv(chain, address, 'day', 90),
    ]);
    return { hour, day };
  }
}

export const priceHistoryService = new PriceHistoryService();
