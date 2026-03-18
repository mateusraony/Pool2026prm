/**
 * Testes ETAPA 15 — price-history.service
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules antes de qualquer import do serviço
vi.mock('../services/cache.service.js', () => {
  const mockGet = vi.fn(() => ({ data: null, isStale: false, age: 0 }));
  const mockSet = vi.fn();
  return { cacheService: { get: mockGet, set: mockSet } };
});

vi.mock('../services/retry.service.js', () => ({
  fetchWithRetry: vi.fn((_name: string, fetchFn: () => Promise<unknown>) => fetchFn()),
}));

vi.mock('../services/log.service.js', () => ({
  logService: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Importar após mocks
import { priceHistoryService } from '../services/price-history.service.js';
import { cacheService } from '../services/cache.service.js';

type MockCandle = [number, number, number, number, number, number];

const makeMockList = (count: number): MockCandle[] =>
  Array.from({ length: count }, (_, i) => [
    1700000000 - i * 3600, // timestamp decrescente (GeckoTerminal)
    100 + i,
    105 + i,
    95 + i,
    102 + i,
    1000 * (i + 1),
  ]);

function mockFetchOk(list: MockCandle[]) {
  return vi.spyOn(global, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ data: { attributes: { ohlcv_list: list } } }),
  } as Response);
}

describe('PriceHistoryService — getOhlcv', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cacheService.get as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, isStale: false, age: 0 });
  });

  it('retorna null quando lista OHLCV está vazia', async () => {
    mockFetchOk([]);
    const result = await priceHistoryService.getOhlcv('ethereum', '0xabc', 'hour', 168);
    expect(result).toBeNull();
    vi.restoreAllMocks();
  });

  it('retorna null quando fetch lança exceção', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));
    const result = await priceHistoryService.getOhlcv('arbitrum', '0xdef', 'day', 90);
    expect(result).toBeNull();
    vi.restoreAllMocks();
  });

  it('retorna null quando resposta HTTP não é ok', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response);
    const result = await priceHistoryService.getOhlcv('base', '0x123', 'hour', 50);
    expect(result).toBeNull();
    vi.restoreAllMocks();
  });

  it('retorna candles em ordem cronológica (timestamps crescentes)', async () => {
    mockFetchOk(makeMockList(5));
    const result = await priceHistoryService.getOhlcv('ethereum', '0xpool', 'hour', 5);

    expect(result).not.toBeNull();
    expect(result!.candles).toHaveLength(5);
    for (let i = 1; i < result!.candles.length; i++) {
      expect(result!.candles[i].timestamp).toBeGreaterThan(result!.candles[i - 1].timestamp);
    }
    vi.restoreAllMocks();
  });

  it('converte timestamps de segundos para milissegundos', async () => {
    const tsSeconds = 1700000000;
    mockFetchOk([[tsSeconds, 100, 105, 95, 102, 1000]]);
    const result = await priceHistoryService.getOhlcv('ethereum', '0xpool', 'hour', 1);
    expect(result!.candles[0].timestamp).toBe(tsSeconds * 1000);
    vi.restoreAllMocks();
  });

  it('mapeia campos OHLCV corretamente', async () => {
    mockFetchOk([[1700000000, 111.1, 222.2, 99.9, 150.5, 999000]]);
    const result = await priceHistoryService.getOhlcv('base', '0xpool', 'day', 1);
    const c = result!.candles[0];
    expect(c.open).toBe(111.1);
    expect(c.high).toBe(222.2);
    expect(c.low).toBe(99.9);
    expect(c.close).toBe(150.5);
    expect(c.volume).toBe(999000);
    vi.restoreAllMocks();
  });

  it('usa cache hit e não faz fetch', async () => {
    const cachedResult = {
      chain: 'ethereum',
      address: '0xcached',
      timeframe: 'hour' as const,
      candles: [{ timestamp: 1700000000000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }],
      currency: 'usd' as const,
      token: 'base' as const,
      fetchedAt: new Date().toISOString(),
    };
    (cacheService.get as ReturnType<typeof vi.fn>).mockReturnValue({ data: cachedResult, isStale: false, age: 0 });

    const fetchSpy = vi.spyOn(global, 'fetch');
    const result = await priceHistoryService.getOhlcv('ethereum', '0xcached', 'hour');

    expect(result).toEqual(cachedResult);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('clamp limit no máximo por timeframe (minute max = 720)', async () => {
    const fetchSpy = mockFetchOk([]);
    await priceHistoryService.getOhlcv('ethereum', '0xpool', 'minute', 9999);
    const url = (fetchSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(url).toContain('limit=720');
    vi.restoreAllMocks();
  });

  it('usa polygon_pos para chain polygon', async () => {
    const fetchSpy = mockFetchOk([]);
    await priceHistoryService.getOhlcv('polygon', '0xpool', 'hour', 24);
    const url = (fetchSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(url).toContain('/networks/polygon_pos/');
    vi.restoreAllMocks();
  });

  it('usa eth para chain ethereum', async () => {
    const fetchSpy = mockFetchOk([]);
    await priceHistoryService.getOhlcv('ethereum', '0xpool', 'hour', 10);
    const url = (fetchSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(url).toContain('/networks/eth/');
    vi.restoreAllMocks();
  });

  it('inclui timeframe na URL', async () => {
    const fetchSpy = mockFetchOk([]);
    await priceHistoryService.getOhlcv('ethereum', '0xpool', 'day', 30);
    const url = (fetchSpy.mock.calls[0]?.[0] as string) ?? '';
    expect(url).toContain('/ohlcv/day');
    vi.restoreAllMocks();
  });

  it('salva resultado no cache após fetch bem-sucedido', async () => {
    mockFetchOk([[1700000000, 1, 2, 0.5, 1.5, 100]]);
    await priceHistoryService.getOhlcv('ethereum', '0xpool', 'hour', 1);
    expect(cacheService.set).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });
});

describe('PriceHistoryService — getMultiTimeframe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cacheService.get as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, isStale: false, age: 0 });
  });

  it('retorna hour null e day null quando fetch falha em ambos', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    const result = await priceHistoryService.getMultiTimeframe('ethereum', '0xpool');
    expect(result.hour).toBeNull();
    expect(result.day).toBeNull();
    vi.restoreAllMocks();
  });

  it('faz dois fetches em paralelo', async () => {
    let callCount = 0;
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({ data: { attributes: { ohlcv_list: [[1700000000, 1, 2, 0.5, 1.5, 100]] } } }),
      } as Response;
    });

    await priceHistoryService.getMultiTimeframe('ethereum', '0xpool');
    expect(callCount).toBe(2);
    vi.restoreAllMocks();
  });
});
