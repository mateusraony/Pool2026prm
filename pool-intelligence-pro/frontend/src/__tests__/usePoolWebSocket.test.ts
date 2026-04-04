/**
 * Testes: usePoolWebSocket — join/leave room, liveData, positionAlert
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockEmit = vi.fn();
const mockOn = vi.fn();
const mockOff = vi.fn();

vi.mock('@/hooks/useWebSocket', () => ({
  getSocket: vi.fn(() => ({
    emit: mockEmit,
    on: mockOn,
    off: mockOff,
    connected: true,
  })),
}));

// Importar após mock
const { usePoolWebSocket } = await import('@/hooks/usePoolWebSocket');

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('usePoolWebSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emite pool:subscribe no mount com chain e address corretos', () => {
    renderHook(() => usePoolWebSocket('ethereum', '0xabc'), { wrapper: createWrapper() });
    expect(mockEmit).toHaveBeenCalledWith('pool:subscribe', { chain: 'ethereum', address: '0xabc' });
  });

  it('emite pool:unsubscribe no unmount', () => {
    const { unmount } = renderHook(
      () => usePoolWebSocket('ethereum', '0xabc'),
      { wrapper: createWrapper() }
    );
    unmount();
    expect(mockEmit).toHaveBeenCalledWith('pool:unsubscribe', { chain: 'ethereum', address: '0xabc' });
  });

  it('não emite subscribe quando chain ou address são undefined', () => {
    renderHook(() => usePoolWebSocket(undefined, '0xabc'), { wrapper: createWrapper() });
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('atualiza liveData e lastUpdated ao receber pool:updated da pool correta', () => {
    const handlers: Record<string, (data: unknown) => void> = {};
    mockOn.mockImplementation((event: string, handler: (data: unknown) => void) => {
      handlers[event] = handler;
    });

    const { result } = renderHook(
      () => usePoolWebSocket('ethereum', '0xabc'),
      { wrapper: createWrapper() }
    );

    expect(result.current.liveData).toBeNull();

    const fakePayload = {
      pool: { chain: 'ethereum', poolAddress: '0xabc', price: 1800, tvlUSD: 5e6, healthScore: 72 },
      updatedAt: '2026-03-18T12:00:00Z',
      positionAlert: 'in_range' as const,
    };

    act(() => {
      handlers['pool:updated']?.(fakePayload);
    });

    expect(result.current.liveData).toMatchObject(fakePayload.pool);
    expect(result.current.lastUpdated).toBeInstanceOf(Date);
    expect(result.current.positionAlert).toBe('in_range');
  });

  it('ignora pool:updated de pool diferente', () => {
    const handlers: Record<string, (data: unknown) => void> = {};
    mockOn.mockImplementation((event: string, handler: (data: unknown) => void) => {
      handlers[event] = handler;
    });

    const { result } = renderHook(
      () => usePoolWebSocket('ethereum', '0xabc'),
      { wrapper: createWrapper() }
    );

    act(() => {
      handlers['pool:updated']?.({
        pool: { chain: 'ethereum', poolAddress: '0xoutro', price: 999 },
        updatedAt: new Date().toISOString(),
      });
    });

    expect(result.current.liveData).toBeNull(); // Ignorou
  });
});
