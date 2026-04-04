/**
 * Web Vitals monitoring — Core Web Vitals (LCP, FID, CLS, TTFB, INP).
 * Reports metrics to backend and exposes them via hook for dashboard display.
 */
import { onCLS, onLCP, onTTFB, onINP, type Metric } from 'web-vitals';

export interface VitalsData {
  CLS: number | null;
  LCP: number | null;
  TTFB: number | null;
  INP: number | null;
  timestamp: string;
}

const vitalsStore: VitalsData = {
  CLS: null,
  LCP: null,
  TTFB: null,
  INP: null,
  timestamp: new Date().toISOString(),
};

// Listeners for reactive updates
type VitalsListener = (data: VitalsData) => void;
const listeners: VitalsListener[] = [];

function notifyListeners() {
  vitalsStore.timestamp = new Date().toISOString();
  for (const fn of listeners) {
    fn({ ...vitalsStore });
  }
}

export function subscribeVitals(fn: VitalsListener): () => void {
  listeners.push(fn);
  fn({ ...vitalsStore }); // emit current state
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function handleMetric(metric: Metric) {
  const name = metric.name as keyof Omit<VitalsData, 'timestamp'>;
  (vitalsStore as any)[name] = Math.round(metric.value * 100) / 100;
  notifyListeners();

  // Send to backend (fire and forget)
  try {
    const payload = { name: metric.name, value: metric.value, rating: metric.rating };
    navigator.sendBeacon?.('/api/metrics/vitals', JSON.stringify(payload));
  } catch {
    // Silently ignore — monitoring should never break the app
  }
}

/**
 * Initialize Web Vitals monitoring. Call once in main.tsx.
 */
export function initWebVitals() {
  try {
    onCLS(handleMetric);
    onLCP(handleMetric);
    onTTFB(handleMetric);
    onINP(handleMetric);
  } catch {
    // web-vitals may not be supported in all environments
  }
}

/**
 * Get the performance rating for a vital metric.
 * Based on Google's Core Web Vitals thresholds.
 */
export function getVitalRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const thresholds: Record<string, [number, number]> = {
    CLS: [0.1, 0.25],
    LCP: [2500, 4000],
    TTFB: [800, 1800],
    INP: [200, 500],
  };
  const [good, poor] = thresholds[name] || [Infinity, Infinity];
  if (value <= good) return 'good';
  if (value <= poor) return 'needs-improvement';
  return 'poor';
}

export function getVitalsSnapshot(): VitalsData {
  return { ...vitalsStore };
}
