import { useMemo } from 'react';
import { Repeat, TrendingUp, Clock, Fuel, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';

interface AutoCompoundWidgetProps {
  apr: number;               // % anual
  timeInRangePct: number;    // 0–100
  capital: number;           // USD
  gasEstimate: number;       // USD por compound tx
  daysElapsed?: number;      // dias desde abertura (opcional)
  chain: string;
}

interface OptimalResult {
  dailyFees: number;
  feesAccruedEstimate: number;
  breakEvenDays: number;
  optimalIntervalDays: number;
  aprSimple: number;
  aprCompounded: number;
  aprBoostPct: number;
  shouldCompoundNow: boolean;
  nextCompoundInDays: number;
}

function calcOptimalCompoundLocal(params: {
  capital: number; apr: number; timeInRangePct: number;
  gasEstimate: number; daysElapsed: number;
}): OptimalResult {
  const { capital, apr, timeInRangePct, gasEstimate, daysElapsed } = params;
  const dailyFees = (Math.max(0, apr) / 100 / 365) * capital * (Math.min(100, Math.max(0, timeInRangePct)) / 100);

  if (dailyFees <= 0 || capital <= 0) {
    return {
      dailyFees: 0, feesAccruedEstimate: 0, breakEvenDays: Infinity,
      optimalIntervalDays: Infinity, aprSimple: apr, aprCompounded: 0,
      aprBoostPct: 0, shouldCompoundNow: false, nextCompoundInDays: Infinity,
    };
  }

  const breakEvenDays = gasEstimate / dailyFees;
  const optimalIntervalDays = Math.sqrt((2 * gasEstimate) / dailyFees);
  const dailyRate = dailyFees / capital;
  const aprCompounded = (Math.pow(1 + dailyRate, 365) - 1) * 100;
  const aprBoostPct = Math.max(0, aprCompounded - apr);
  const feesAccruedEstimate = dailyFees * daysElapsed;
  const shouldCompoundNow = feesAccruedEstimate >= gasEstimate * 3;
  const nextCompoundInDays = optimalIntervalDays - (daysElapsed % optimalIntervalDays);

  return {
    dailyFees: Math.round(dailyFees * 100) / 100,
    feesAccruedEstimate: Math.round(feesAccruedEstimate * 100) / 100,
    breakEvenDays: Math.round(breakEvenDays * 10) / 10,
    optimalIntervalDays: Math.round(optimalIntervalDays * 10) / 10,
    aprSimple: apr,
    aprCompounded: Math.round(aprCompounded * 100) / 100,
    aprBoostPct: Math.round(aprBoostPct * 100) / 100,
    shouldCompoundNow,
    nextCompoundInDays: Math.round(nextCompoundInDays * 10) / 10,
  };
}

export function AutoCompoundWidget({ apr, timeInRangePct, capital, gasEstimate, daysElapsed = 0, chain }: AutoCompoundWidgetProps) {
  const result = useMemo(() =>
    calcOptimalCompoundLocal({ capital, apr, timeInRangePct, gasEstimate, daysElapsed }),
    [capital, apr, timeInRangePct, gasEstimate, daysElapsed]
  );

  const isInfinite = !isFinite(result.optimalIntervalDays);
  const progressPct = isInfinite || gasEstimate <= 0 ? 0 :
    Math.min(100, (result.feesAccruedEstimate / (gasEstimate * 3)) * 100);

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="font-semibold flex items-center gap-2 text-sm">
          <Repeat className="w-4 h-4 text-primary" />
          Auto-Compound Strategy
        </h3>
        {result.shouldCompoundNow && (
          <span className="flex items-center gap-1 text-xs text-success-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Pronto para compound
          </span>
        )}
      </div>

      <div className="card-body space-y-4">
        {isInfinite ? (
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 text-center">
            Capital muito pequeno para compensar o custo de gas (~${gasEstimate.toFixed(2)}).<br />
            Aumente o capital ou aguarde fees acumularem.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="stat-card">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-success-400" />
                  <span className="text-xs">Fees/dia</span>
                </div>
                <div className="font-bold text-success-400">~${result.dailyFees.toFixed(2)}</div>
              </div>
              <div className="stat-card">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="text-xs">Compound otimo</span>
                </div>
                <div className="font-bold">
                  {result.optimalIntervalDays < 1
                    ? `${Math.round(result.optimalIntervalDays * 24)}h`
                    : `${result.optimalIntervalDays.toFixed(1)}d`}
                </div>
              </div>
              <div className="stat-card">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs">APY com compound</span>
                </div>
                <div className="font-bold text-primary">{result.aprCompounded.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">+{result.aprBoostPct.toFixed(1)}% vs APR simples</div>
              </div>
              <div className="stat-card">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                  <Fuel className="w-3.5 h-3.5" />
                  <span className="text-xs">Break-even gas</span>
                </div>
                <div className="font-bold">{result.breakEvenDays.toFixed(1)}d</div>
                <div className="text-xs text-muted-foreground">(fees &ge; gas em {result.breakEvenDays.toFixed(1)} dias)</div>
              </div>
            </div>

            {/* Barra de progresso: fees acumuladas vs limiar 3x gas */}
            {daysElapsed > 0 && (
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Fees acumuladas: ~${result.feesAccruedEstimate.toFixed(2)}</span>
                  <span>Limiar: ${(gasEstimate * 3).toFixed(2)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={clsx(
                      'h-full rounded-full transition-all',
                      result.shouldCompoundNow ? 'bg-success-500' : 'bg-primary-500'
                    )}
                    style={{ width: `${Math.min(100, progressPct)}%` }}
                  />
                </div>
                {!result.shouldCompoundNow && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Proximo compound ideal: em ~{result.nextCompoundInDays.toFixed(1)} dias
                  </div>
                )}
              </div>
            )}

            <div className="text-xs text-muted-foreground/60 border-t border-border/40 pt-2">
              Formula: intervalo otimo = &radic;(2 &times; gas / fees_diarias). Gas estimado: ~${gasEstimate.toFixed(2)} ({chain}).
            </div>
          </>
        )}
      </div>
    </div>
  );
}
