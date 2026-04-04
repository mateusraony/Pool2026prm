import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Wallet, BarChart3 } from 'lucide-react';
import type { Pool } from '@/types/pool';

interface HodlVsLpProps {
  pool: Pool;
  className?: string;
}

const CAPITAL_PRESETS = [1000, 5000, 10000, 25000];
const PERIOD_PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '1a', days: 365 },
];

/**
 * Simulates HODL vs LP returns for a given pool.
 * Uses pool metrics (APR, fees, IL estimate, volatility) for projection.
 */
function simulateReturns(pool: Pool, capital: number, days: number) {
  const apr = pool.apr || 0;
  const dailyFeeRate = pool.metrics.feesEstimated; // daily fee/TVL ratio
  const ilEstimate = pool.metrics.ilEstimated; // estimated IL fraction

  // LP returns: fees earned over period minus estimated IL
  const feesEarned = capital * dailyFeeRate * days;
  const ilLoss = capital * ilEstimate * (days / 30); // IL scales with sqrt(time), simplified
  const lpValue = capital + feesEarned - ilLoss;
  const lpReturn = lpValue - capital;
  const lpReturnPct = capital > 0 ? (lpReturn / capital) * 100 : 0;

  // HODL: assume 50/50 split, price doesn't change (neutral scenario)
  // With APR from lending/staking opportunity cost
  const hodlValue = capital; // HODL = just hold, no yield
  const hodlReturn = 0;
  const hodlReturnPct = 0;

  // APR-based LP projection (alternative calculation)
  const aprBasedReturn = capital * (apr / 100) * (days / 365);
  const aprBasedLpValue = capital + aprBasedReturn - ilLoss;

  // Use the more conservative estimate
  const bestLpValue = Math.min(lpValue, aprBasedLpValue);
  const bestLpReturn = bestLpValue - capital;
  const bestLpReturnPct = capital > 0 ? (bestLpReturn / capital) * 100 : 0;

  const advantage = bestLpReturn - hodlReturn;
  const advantagePct = capital > 0 ? (advantage / capital) * 100 : 0;
  const lpWins = advantage > 0;

  return {
    capital,
    days,
    lp: {
      value: Math.round(bestLpValue * 100) / 100,
      return: Math.round(bestLpReturn * 100) / 100,
      returnPct: Math.round(bestLpReturnPct * 100) / 100,
      feesEarned: Math.round(feesEarned * 100) / 100,
      ilLoss: Math.round(ilLoss * 100) / 100,
    },
    hodl: {
      value: Math.round(hodlValue * 100) / 100,
      return: Math.round(hodlReturn * 100) / 100,
      returnPct: Math.round(hodlReturnPct * 100) / 100,
    },
    advantage: Math.round(advantage * 100) / 100,
    advantagePct: Math.round(advantagePct * 100) / 100,
    lpWins,
  };
}

export function HodlVsLp({ pool, className }: HodlVsLpProps) {
  const [capital, setCapital] = useState(10000);
  const [periodIdx, setPeriodIdx] = useState(1); // 30d default

  const period = PERIOD_PRESETS[periodIdx];

  const result = useMemo(
    () => simulateReturns(pool, capital, period.days),
    [pool, capital, period.days]
  );

  return (
    <div className={cn('glass-card p-6', className)}>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">HODL vs LP — Comparacao</h3>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Capital:</span>
          <div className="flex gap-1">
            {CAPITAL_PRESETS.map(c => (
              <button
                key={c}
                onClick={() => setCapital(c)}
                className={cn(
                  'px-2 py-1 rounded text-xs font-mono transition-colors',
                  capital === c
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/60 text-muted-foreground hover:bg-secondary'
                )}
              >
                ${(c / 1000).toFixed(0)}k
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Periodo:</span>
          <div className="flex gap-1">
            {PERIOD_PRESETS.map((p, i) => (
              <button
                key={p.label}
                onClick={() => setPeriodIdx(i)}
                className={cn(
                  'px-2 py-1 rounded text-xs font-mono transition-colors',
                  periodIdx === i
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/60 text-muted-foreground hover:bg-secondary'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison Cards */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* HODL */}
        <div className="rounded-xl border border-border/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">HODL</span>
            <span className="text-[10px] text-muted-foreground">(Apenas segurar)</span>
          </div>
          <p className="font-mono text-2xl font-bold">${result.hodl.value.toLocaleString()}</p>
          <p className={cn('text-sm font-mono mt-1', result.hodl.return >= 0 ? 'text-success' : 'text-destructive')}>
            {result.hodl.return >= 0 ? '+' : ''}${result.hodl.return.toFixed(2)} ({result.hodl.returnPct.toFixed(2)}%)
          </p>
        </div>

        {/* LP */}
        <div className={cn(
          'rounded-xl border p-4',
          result.lpWins ? 'border-success/30 bg-success/5' : 'border-destructive/30 bg-destructive/5'
        )}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">LP</span>
            <span className="text-[10px] text-muted-foreground">(Prover liquidez)</span>
          </div>
          <p className="font-mono text-2xl font-bold">${result.lp.value.toLocaleString()}</p>
          <p className={cn('text-sm font-mono mt-1', result.lp.return >= 0 ? 'text-success' : 'text-destructive')}>
            {result.lp.return >= 0 ? '+' : ''}${result.lp.return.toFixed(2)} ({result.lp.returnPct.toFixed(2)}%)
          </p>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg bg-secondary/30 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fees Estimadas</p>
          <p className="font-mono text-sm text-success mt-1">+${result.lp.feesEarned.toFixed(2)}</p>
        </div>
        <div className="rounded-lg bg-secondary/30 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">IL Estimada</p>
          <p className="font-mono text-sm text-destructive mt-1">-${result.lp.ilLoss.toFixed(2)}</p>
        </div>
        <div className={cn('rounded-lg p-3 text-center', result.lpWins ? 'bg-success/10' : 'bg-destructive/10')}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">LP vs HODL</p>
          <div className="flex items-center justify-center gap-1 mt-1">
            {result.lpWins ? (
              <TrendingUp className="h-3.5 w-3.5 text-success" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
            )}
            <p className={cn('font-mono text-sm font-medium', result.lpWins ? 'text-success' : 'text-destructive')}>
              {result.advantage >= 0 ? '+' : ''}${result.advantage.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Verdict */}
      <div className={cn(
        'rounded-lg p-3 text-center text-sm',
        result.lpWins
          ? 'bg-success/8 border border-success/20 text-success'
          : 'bg-warning/8 border border-warning/20 text-warning'
      )}>
        {result.lpWins ? (
          <>LP supera HODL em <span className="font-mono font-bold">${result.advantage.toFixed(2)}</span> ({result.advantagePct.toFixed(2)}%) em {period.label}</>
        ) : (
          <>HODL supera LP em <span className="font-mono font-bold">${Math.abs(result.advantage).toFixed(2)}</span> — IL reduz ganhos de fees neste cenario</>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground mt-3 text-center">
        Projecao baseada em APR atual ({pool.apr.toFixed(1)}%), fees e IL estimados. Resultados reais podem variar.
      </p>
    </div>
  );
}
