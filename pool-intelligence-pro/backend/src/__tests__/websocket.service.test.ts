/**
 * Testes: WebSocketService — broadcastPoolUpdate, throttle, positionAlert
 * Estratégia: injetar mock de io no singleton após reset do throttle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UnifiedPool } from '../types/index.js';

vi.mock('../services/log.service.js', () => ({
  logService: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockGetPositions = vi.fn().mockReturnValue([]);
vi.mock('../services/range.service.js', () => ({
  rangeMonitorService: { getPositions: mockGetPositions },
}));

const { wsService } = await import('../services/websocket.service.js');

// Helpers para injetar mock de io e resetar throttle entre testes
function makeMockIo() {
  const toEmit = vi.fn();
  const to = vi.fn().mockReturnValue({ emit: toEmit });
  return { mockIo: { to, emit: vi.fn() }, toEmit };
}

function injectIo(mockIo: object) {
  (wsService as unknown as { io: object }).io = mockIo;
}

function resetThrottle() {
  (wsService as unknown as { poolBroadcastThrottle: Map<string, number> })
    .poolBroadcastThrottle.clear();
}

const basePool = {
  chain: 'ethereum',
  poolAddress: '0xpool1',
  price: 2000,
  tvlUSD: 1_000_000,
  healthScore: 70,
  updatedAt: new Date().toISOString(),
} as UnifiedPool;

describe('WebSocketService — broadcastPoolUpdate', () => {
  let toEmit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPositions.mockReturnValue([]);
    resetThrottle();
    const { mockIo, toEmit: te } = makeMockIo();
    toEmit = te;
    injectIo(mockIo);
  });

  it('emite pool:updated com pool e updatedAt na primeira chamada', () => {
    wsService.broadcastPoolUpdate(basePool);
    expect(toEmit).toHaveBeenCalledOnce();
    expect(toEmit).toHaveBeenCalledWith('pool:updated', expect.objectContaining({
      pool: basePool,
      updatedAt: expect.any(String),
    }));
  });

  it('respeita throttle de 10s — segunda chamada imediata NÃO emite', () => {
    wsService.broadcastPoolUpdate(basePool);
    toEmit.mockClear();
    wsService.broadcastPoolUpdate(basePool); // mesma pool, < 10s depois
    expect(toEmit).not.toHaveBeenCalled();
  });

  it('pool diferente não é afetada pelo throttle da primeira pool', () => {
    wsService.broadcastPoolUpdate(basePool);
    toEmit.mockClear();
    const otherPool = { ...basePool, poolAddress: '0xpool2' } as UnifiedPool;
    wsService.broadcastPoolUpdate(otherPool);
    expect(toEmit).toHaveBeenCalledOnce();
  });

  it('não inclui positionAlert quando não há posição ativa para a pool', () => {
    mockGetPositions.mockReturnValue([]);
    wsService.broadcastPoolUpdate(basePool);
    const payload = toEmit.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload).toBeDefined();
    expect(payload).not.toHaveProperty('positionAlert');
  });

  it('positionAlert = out_of_range quando preço abaixo do rangeLower', () => {
    mockGetPositions.mockReturnValue([{
      id: '1', poolId: 'ethereum_0xpool3',
      poolAddress: '0xpool3', chain: 'ethereum',
      rangeLower: 2500, rangeUpper: 3000,
      entryPrice: 2750, capital: 1000, mode: 'NORMAL',
      isActive: true, createdAt: new Date(),
      token0Symbol: 'WETH', token1Symbol: 'USDC',
    }]);

    const poolOut = { ...basePool, poolAddress: '0xpool3', price: 2000 } as UnifiedPool;
    wsService.broadcastPoolUpdate(poolOut);

    expect(toEmit).toHaveBeenCalledWith('pool:updated', expect.objectContaining({
      positionAlert: 'out_of_range',
    }));
  });

  it('positionAlert = in_range quando preço dentro do range com margem', () => {
    mockGetPositions.mockReturnValue([{
      id: '2', poolId: 'ethereum_0xpool5',
      poolAddress: '0xpool5', chain: 'ethereum',
      rangeLower: 1800, rangeUpper: 2200,
      entryPrice: 2000, capital: 1000, mode: 'NORMAL',
      isActive: true, createdAt: new Date(),
      token0Symbol: 'WETH', token1Symbol: 'USDC',
    }]);

    const poolIn = { ...basePool, poolAddress: '0xpool5', price: 2000 } as UnifiedPool;
    wsService.broadcastPoolUpdate(poolIn);

    expect(toEmit).toHaveBeenCalledWith('pool:updated', expect.objectContaining({
      positionAlert: 'in_range',
    }));
  });
});
