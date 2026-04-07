import { useState } from 'react';
import { Landmark, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import clsx from 'clsx';

interface LendingRiskPanelProps {
  currentPrice: number;
  poolScore: number;
  poolApr: number;
  chain: string;
  poolAddress?: string;
}

interface Scenario {
  label: string;
  ltvPct: number;
  healthFactor: number;
  liquidationDropPct: number;
  liquidationPrice: number;
  netApr: number;
}

function calcScenarios(
  currentPrice: number,
  poolScore: number,
  poolApr: number,
  interestRate = 8
): { ltvMax: number; scenarios: Scenario[] } {
  const ltvMax = poolScore >= 75 ? 70 : poolScore >= 50 ? 55 : 35;

  const defs = [
    { label: 'Conservador', fraction: 0.5 },
    { label: 'Moderado', fraction: 0.75 },
    { label: 'Agressivo', fraction: 0.95 },
  ];

  const scenarios: Scenario[] = defs.map(d => {
    const ltvPct = ltvMax * d.fraction;
    const hf = ltvMax / ltvPct;
    const liqPrice = currentPrice * (ltvPct / ltvMax);
    const liqDrop = (1 - ltvPct / ltvMax) * 100;
    // netApr com leverage ratio = ltvPct/(ltvMax - ltvPct) aproximadamente
    const leverageRatio = ltvPct / 100; // borrowAmount/capital ≈ ltvPct/100
    const netApr = poolApr + (poolApr - interestRate) * leverageRatio;
    return {
      label: d.label,
      ltvPct: Math.round(ltvPct * 10) / 10,
      healthFactor: Math.round(hf * 100) / 100,
      liquidationDropPct: Math.round(liqDrop * 10) / 10,
      liquidationPrice: Math.round(liqPrice * 100) / 100,
      netApr: Math.round(netApr * 100) / 100,
    };
  });

  return { ltvMax, scenarios };
}

function hfColor(hf: number): string {
  if (hf < 1.2) return 'text-destructive';
  if (hf < 2.0) return 'text-warning';
  return 'text-success-400';
}

export function LendingRiskPanel({ currentPrice, poolScore, poolApr, chain, poolAddress }: LendingRiskPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!currentPrice || currentPrice <= 0) return null;

  const { ltvMax, scenarios } = calcScenarios(currentPrice, poolScore, poolApr);

  const lendingUrl = poolAddress
    ? `/lending?pool=${poolAddress}&chain=${chain}`
    : '/lending';

  return (
    <div className="card">
      <button
        className="card-header w-full flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors rounded-t-xl px-4 py-3"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <Landmark className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">Lending Risk (Colateral Simulado)</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">LTV max: {ltvMax}%</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="card-body space-y-3 pt-0">
          <p className="text-xs text-muted-foreground">
            Simulacao de uso desta pool como colateral no protocolo Revert Lend. LTV maximo baseado no score da pool.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border/60">
                  <th className="text-left pb-2">Cenario</th>
                  <th className="text-right pb-2">LTV</th>
                  <th className="text-right pb-2">Health Factor</th>
                  <th className="text-right pb-2">Liquidacao</th>
                  <th className="text-right pb-2">Net APR</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map(s => (
                  <tr key={s.label} className="border-b border-border/30 last:border-0">
                    <td className="py-2 font-medium">{s.label}</td>
                    <td className="py-2 text-right">{s.ltvPct}%</td>
                    <td className={clsx('py-2 text-right font-bold', hfColor(s.healthFactor))}>
                      {s.healthFactor.toFixed(2)}
                    </td>
                    <td className="py-2 text-right">
                      <div className="text-destructive text-xs">-{s.liquidationDropPct}%</div>
                      <div className="text-xs text-muted-foreground">${s.liquidationPrice.toFixed(2)}</div>
                    </td>
                    <td className={clsx('py-2 text-right font-medium text-xs', s.netApr >= 0 ? 'text-success-400' : 'text-destructive')}>
                      {s.netApr >= 0 ? '+' : ''}{s.netApr.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground/60">Simulacao educacional — nao constitui oferta de credito</p>
            <a
              href={lendingUrl}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Simular em detalhes <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
