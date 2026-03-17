/**
 * Web Vitals Widget — displays Core Web Vitals metrics in real-time.
 * Shows LCP, FID, CLS, TTFB, INP with color-coded ratings.
 */
import { useState, useEffect } from 'react';
import { subscribeVitals, getVitalRating, type VitalsData } from '@/lib/web-vitals';

const VITAL_INFO: Record<string, { label: string; unit: string; description: string }> = {
  LCP: { label: 'LCP', unit: 'ms', description: 'Largest Contentful Paint' },
  CLS: { label: 'CLS', unit: '', description: 'Cumulative Layout Shift' },
  TTFB: { label: 'TTFB', unit: 'ms', description: 'Time to First Byte' },
  INP: { label: 'INP', unit: 'ms', description: 'Interaction to Next Paint' },
};

const RATING_COLORS = {
  good: 'text-green-400 bg-green-500/10',
  'needs-improvement': 'text-yellow-400 bg-yellow-500/10',
  poor: 'text-red-400 bg-red-500/10',
};

export function WebVitalsWidget() {
  const [vitals, setVitals] = useState<VitalsData | null>(null);

  useEffect(() => {
    return subscribeVitals(setVitals);
  }, []);

  if (!vitals) return null;

  const entries = Object.entries(VITAL_INFO).filter(([key]) => {
    const val = vitals[key as keyof Omit<VitalsData, 'timestamp'>];
    return val !== null;
  });

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-border p-4">
        <h3 className="text-sm font-medium mb-2">Web Vitals</h3>
        <p className="text-xs text-muted-foreground">Aguardando metricas de performance...</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border p-4">
      <h3 className="text-sm font-medium mb-3">Web Vitals</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {entries.map(([key, info]) => {
          const value = vitals[key as keyof Omit<VitalsData, 'timestamp'>] as number;
          const rating = getVitalRating(key, value);
          const colorClass = RATING_COLORS[rating];

          return (
            <div key={key} className={`rounded-lg px-3 py-2 ${colorClass}`}>
              <p className="text-[10px] uppercase tracking-wide opacity-70">{info.description}</p>
              <p className="text-lg font-bold tabular-nums">
                {key === 'CLS' ? value.toFixed(3) : Math.round(value)}
                <span className="text-xs font-normal ml-0.5">{info.unit}</span>
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
