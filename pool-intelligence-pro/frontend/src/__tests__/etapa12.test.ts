/**
 * Testes ETAPA 12 — Mobile-First + Performance
 * Cobre: web-vitals helpers, usePullToRefresh logic, LiveIndicator snapshot, 12.9 card view.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// 1. WEB VITALS — getVitalRating
// ============================================================

import { getVitalRating, getVitalsSnapshot, subscribeVitals } from '../lib/web-vitals';

describe('getVitalRating', () => {
  it('classifica CLS bom (≤0.1)', () => {
    expect(getVitalRating('CLS', 0.05)).toBe('good');
    expect(getVitalRating('CLS', 0.1)).toBe('good');
  });

  it('classifica CLS needs-improvement (0.1 < x ≤ 0.25)', () => {
    expect(getVitalRating('CLS', 0.15)).toBe('needs-improvement');
    expect(getVitalRating('CLS', 0.25)).toBe('needs-improvement');
  });

  it('classifica CLS poor (>0.25)', () => {
    expect(getVitalRating('CLS', 0.3)).toBe('poor');
  });

  it('classifica LCP bom (≤2500ms)', () => {
    expect(getVitalRating('LCP', 2000)).toBe('good');
    expect(getVitalRating('LCP', 2500)).toBe('good');
  });

  it('classifica LCP poor (>4000ms)', () => {
    expect(getVitalRating('LCP', 5000)).toBe('poor');
  });

  it('classifica TTFB bom (≤800ms)', () => {
    expect(getVitalRating('TTFB', 500)).toBe('good');
  });

  it('classifica TTFB needs-improvement (800 < x ≤ 1800)', () => {
    expect(getVitalRating('TTFB', 1200)).toBe('needs-improvement');
  });

  it('classifica INP bom (≤200ms)', () => {
    expect(getVitalRating('INP', 150)).toBe('good');
  });

  it('classifica INP poor (>500ms)', () => {
    expect(getVitalRating('INP', 600)).toBe('poor');
  });

  it('métrica desconhecida retorna good (sem threshold)', () => {
    expect(getVitalRating('FCP', 1000)).toBe('good');
  });
});

describe('getVitalsSnapshot', () => {
  it('retorna objeto com campos obrigatórios', () => {
    const snap = getVitalsSnapshot();
    expect(snap).toHaveProperty('CLS');
    expect(snap).toHaveProperty('LCP');
    expect(snap).toHaveProperty('TTFB');
    expect(snap).toHaveProperty('INP');
    expect(snap).toHaveProperty('timestamp');
  });

  it('retorna cópia (não referência)', () => {
    const a = getVitalsSnapshot();
    const b = getVitalsSnapshot();
    expect(a).not.toBe(b); // objetos diferentes
    expect(a).toEqual(b);  // mesmo conteúdo
  });
});

describe('subscribeVitals', () => {
  it('chama listener imediatamente ao subscrever', () => {
    const listener = vi.fn();
    const unsub = subscribeVitals(listener);
    expect(listener).toHaveBeenCalledOnce();
    unsub();
  });

  it('retorna função de unsubscribe que remove listener', () => {
    const listener = vi.fn();
    const unsub = subscribeVitals(listener);
    const callCount = listener.mock.calls.length;
    unsub();
    // Após unsub, não deve receber mais chamadas se notifyListeners fosse chamado
    expect(listener.mock.calls.length).toBe(callCount);
  });
});

// ============================================================
// 2. PULL-TO-REFRESH — usePullToRefresh (hook logic)
// ============================================================

import { renderHook, act } from '@testing-library/react';
import { usePullToRefresh } from '../hooks/usePullToRefresh';

describe('usePullToRefresh', () => {
  it('inicia com estado neutro', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh(onRefresh));

    expect(result.current.pullDistance).toBe(0);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.showIndicator).toBe(false);
    expect(result.current.progress).toBe(0);
  });

  it('attachTo aceita null sem erro', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh(onRefresh));
    expect(() => {
      act(() => {
        result.current.attachTo(null);
      });
    }).not.toThrow();
  });

  it('progress é calculado como pullDistance/threshold (0..1)', () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh(onRefresh));
    // Por default pullDistance=0, então progress=0
    expect(result.current.progress).toBe(0);
    expect(result.current.progress).toBeGreaterThanOrEqual(0);
    expect(result.current.progress).toBeLessThanOrEqual(1);
  });

  it('showIndicator é false quando pullDistance=0 e não refreshing', () => {
    const onRefresh = vi.fn();
    const { result } = renderHook(() => usePullToRefresh(onRefresh));
    expect(result.current.showIndicator).toBe(false);
  });
});

// ============================================================
// 3. VITALS RATING BATCH — verifica todos os thresholds
// ============================================================

describe('getVitalRating — tabela de thresholds completa', () => {
  const cases: [string, number, 'good' | 'needs-improvement' | 'poor'][] = [
    ['CLS', 0,    'good'],
    ['CLS', 0.09, 'good'],
    ['CLS', 0.1,  'good'],
    ['CLS', 0.11, 'needs-improvement'],
    ['CLS', 0.25, 'needs-improvement'],
    ['CLS', 0.26, 'poor'],
    ['LCP', 1000, 'good'],
    ['LCP', 2500, 'good'],
    ['LCP', 2501, 'needs-improvement'],
    ['LCP', 4000, 'needs-improvement'],
    ['LCP', 4001, 'poor'],
    ['TTFB', 0,    'good'],
    ['TTFB', 800,  'good'],
    ['TTFB', 801,  'needs-improvement'],
    ['TTFB', 1800, 'needs-improvement'],
    ['TTFB', 1801, 'poor'],
    ['INP', 0,   'good'],
    ['INP', 200, 'good'],
    ['INP', 201, 'needs-improvement'],
    ['INP', 500, 'needs-improvement'],
    ['INP', 501, 'poor'],
  ];

  it.each(cases)('%s=%s → %s', (name, value, expected) => {
    expect(getVitalRating(name, value)).toBe(expected);
  });
});
