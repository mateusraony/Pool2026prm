/**
 * Price History Service — ETAPA 15
 * Busca dados OHLCV reais da GeckoTerminal API com cache.
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

class PriceHistoryService {
  /**
   * Busca candles OHLCV para uma pool.
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
        logService.warn('POOLS', 'Empty OHLCV response', { chain, address, timeframe });
        return null;
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
