import { useState, useMemo } from 'react';
import { Landmark, AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { fetchPools } from '../api/client';

// Cálculo de lending local (espelha calcLendingPosition do backend)
function calcLending(params: {
  capital: number;
  entryPrice: number;
  poolScore: number;
  poolApr: number;
  ltvManual: number;
  interestRateManual: number;
  borrowAmount: number;
}) {
  const { capital, entryPrice, poolScore, poolApr, ltvManual, interestRateManual, borrowAmount } = params;
  const ltvMax = poolScore >= 75 ? 70 : poolScore >= 50 ? 55 : 35;
  const ltvUsedPct = capital > 0 ? (borrowAmount / capital) * 100 : 0;
  const healthFactor = ltvUsedPct > 0 ? ltvMax / ltvUsedPct : Infinity;
  const liquidationPrice = ltvUsedPct > 0 ? entryPrice * (ltvUsedPct / ltvMax) : 0;
  const liquidationDropPct = ltvUsedPct > 0 ? (1 - ltvUsedPct / ltvMax) * 100 : 100;
  const netApr = poolApr + (poolApr - interestRateManual) * (borrowAmount / Math.max(1, capital));
  const interestCostAnnual = borrowAmount * interestRateManual / 100;
  const borrowCapacity = capital * ltvMax / 100;
  const riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' =
    healthFactor < 1 ? 'CRITICAL' : healthFactor < 1.2 ? 'HIGH' : healthFactor < 2 ? 'MEDIUM' : 'LOW';

  const scenarios = [
    { label: 'Conservador', ltvFraction: 0.5 },
    { label: 'Moderado', ltvFraction: 0.75 },
    { label: 'Agressivo', ltvFraction: 0.95 },
  ].map(s => {
    const sLtv = ltvMax * s.ltvFraction;
    return {
      label: s.label,
      ltvPct: Math.round(sLtv * 10) / 10,
      healthFactor: Math.round((ltvMax / sLtv) * 100) / 100,
      liquidationDropPct: Math.round((1 - sLtv / ltvMax) * 100 * 10) / 10,
      liquidationPrice: Math.round(entryPrice * (sLtv / ltvMax) * 100) / 100,
    };
  });

  return { ltvMax, ltvUsedPct, healthFactor, liquidationPrice, liquidationDropPct, netApr, interestCostAnnual, borrowCapacity, riskLevel, scenarios, ltvManual };
}

function HFBadge({ hf }: { hf: number }) {
  const display = isFinite(hf) ? hf.toFixed(2) : '∞';
  const cls = hf < 1 ? 'text-destructive' : hf < 1.2 ? 'text-orange-500' : hf < 2 ? 'text-warning' : 'text-success-400';
  return <span className={clsx('font-bold text-lg', cls)}>{display}</span>;
}

export default function LendingSimulator() {
  const { data: poolList = [] } = useQuery({
    queryKey: ['pools', 'ethereum'],
    queryFn: () => fetchPools('ethereum'),
    staleTime: 300_000,
  });

  // fetchPools retorna { pool, score }[] — extraímos e mesclamos
  const pools = useMemo(
    () =>
      poolList.slice(0, 30).map((item: { pool: any; score: any }) => ({
        ...item.pool,
        score: item.score?.total ?? item.score?.score ?? 50,
        apr: item.pool?.apr || item.score?.breakdown?.feeEfficiency || 10,
      })),
    [poolList],
  );

  const [selectedPoolId, setSelectedPoolId] = useState('');
  const [capital, setCapital] = useState(10000);
  const [ltvManual, setLtvManual] = useState(50);
  const [interestRate, setInterestRate] = useState(8);
  const [borrowAmount, setBorrowAmount] = useState(5000);

  const selectedPool = pools.find((p: any) => p.externalId === selectedPoolId || p.poolAddress === selectedPoolId) ?? pools[0];

  const result = useMemo(() => {
    if (!selectedPool) return null;
    const score = selectedPool.score ?? 50;
    const ltvMaxForPool = score >= 75 ? 0.70 : score >= 50 ? 0.55 : 0.35;
    return calcLending({
      capital,
      entryPrice: selectedPool.price || 1,
      poolScore: score,
      poolApr: selectedPool.apr || 10,
      ltvManual,
      interestRateManual: interestRate,
      borrowAmount: Math.min(borrowAmount, capital * ltvMaxForPool),
    });
  }, [selectedPool, capital, ltvManual, interestRate, borrowAmount]);

  const riskColors: Record<string, string> = {
    LOW: 'text-success-400 border-success-500/30 bg-success-500/10',
    MEDIUM: 'text-warning border-warning/30 bg-warning/10',
    HIGH: 'text-orange-500 border-orange-500/30 bg-orange-500/10',
    CRITICAL: 'text-destructive border-destructive/30 bg-destructive/10',
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Landmark className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Lending Simulator</h1>
          <p className="text-muted-foreground text-sm">
            Simule usar sua posição LP como colateral (baseado no protocolo Revert Lend)
          </p>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-border/60 text-xs text-muted-foreground">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          Simulação educacional. Valores baseados em parâmetros do protocolo Revert Lend. Não constitui oferta de crédito.
        </span>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Configuração */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold">Configuração</h2>
          </div>
          <div className="card-body space-y-5">
            {/* Seletor de pool */}
            <div>
              <label className="block text-sm text-muted-foreground mb-2">Pool (colateral)</label>
              <select
                className="input w-full"
                value={selectedPoolId}
                onChange={e => setSelectedPoolId(e.target.value)}
              >
                {pools.map((p: any) => (
                  <option key={p.externalId || p.poolAddress} value={p.externalId || p.poolAddress}>
                    {p.token0?.symbol}/{p.token1?.symbol} — {p.chain} — Score: {(p.score ?? 0).toFixed(0)}
                  </option>
                ))}
              </select>
              {selectedPool && (
                <div className="text-xs text-muted-foreground mt-1">
                  APR: {(selectedPool.apr || 0).toFixed(1)}% | Score: {(selectedPool.score ?? 0).toFixed(0)}/100 | LTV máx:{' '}
                  {result?.ltvMax ?? 55}%
                </div>
              )}
            </div>

            {/* Capital */}
            <div>
              <label className="block text-sm text-muted-foreground mb-2">Capital na pool (USD)</label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <input
                  type="number"
                  value={capital}
                  onChange={e => setCapital(Math.max(1, parseFloat(e.target.value) || 1))}
                  className="input flex-1"
                  min={1}
                />
              </div>
            </div>

            {/* LTV slider */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-muted-foreground">LTV escolhido</label>
                <span className="font-bold">{ltvManual}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={result?.ltvMax ?? 70}
                step={5}
                value={Math.min(ltvManual, result?.ltvMax ?? 70)}
                onChange={e => setLtvManual(parseInt(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>5%</span>
                <span>Máx: {result?.ltvMax ?? 70}%</span>
              </div>
            </div>

            {/* Taxa de juros slider */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <label className="text-muted-foreground">Taxa de juros anual</label>
                <span className="font-bold">{interestRate.toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={30}
                step={0.5}
                value={interestRate}
                onChange={e => setInterestRate(parseFloat(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0.5%</span>
                <span>30%</span>
              </div>
            </div>

            {/* Valor a tomar */}
            <div>
              <label className="block text-sm text-muted-foreground mb-2">Valor a tomar emprestado (USD)</label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <input
                  type="number"
                  value={borrowAmount}
                  onChange={e => setBorrowAmount(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="input flex-1"
                  min={0}
                  max={result?.borrowCapacity ?? 10000}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Capacidade máxima: ${result?.borrowCapacity.toFixed(0) ?? 0}
              </div>
            </div>
          </div>
        </div>

        {/* Resultados */}
        {result && (
          <div className="space-y-4">
            {/* Risk badge */}
            <div className={clsx('card border', riskColors[result.riskLevel])}>
              <div className="card-body flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5" />
                  <span className="font-medium">Risco: {result.riskLevel}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Health Factor</div>
                  <HFBadge hf={result.healthFactor} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="stat-card">
                <div className="text-xs text-muted-foreground mb-1">Preço de liquidação</div>
                <div className="font-bold">${result.liquidationPrice.toFixed(2)}</div>
                <div className="text-xs text-destructive">-{result.liquidationDropPct.toFixed(1)}% do preço atual</div>
              </div>
              <div className="stat-card">
                <div className="text-xs text-muted-foreground mb-1">Net APR (c/ alavancagem)</div>
                <div className={clsx('font-bold', result.netApr >= 0 ? 'text-success-400' : 'text-destructive')}>
                  {result.netApr >= 0 ? '+' : ''}
                  {result.netApr.toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">{(selectedPool?.apr || 0).toFixed(1)}% base da pool</div>
              </div>
              <div className="stat-card">
                <div className="text-xs text-muted-foreground mb-1">Custo de juros/ano</div>
                <div className="font-bold text-destructive">-${result.interestCostAnnual.toFixed(0)}</div>
              </div>
              <div className="stat-card">
                <div className="text-xs text-muted-foreground mb-1">LTV usado</div>
                <div className="font-bold">{result.ltvUsedPct.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">máx: {result.ltvMax}%</div>
              </div>
            </div>

            {/* Aviso se netApr negativo */}
            {result.netApr < 0 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Taxa de juros ({interestRate}%) superior ao APR da pool ({(selectedPool?.apr || 0).toFixed(1)}%). A
                  alavancagem está <strong>reduzindo</strong> o retorno.
                </span>
              </div>
            )}

            {/* Tabela de cenários */}
            <div className="card">
              <div className="card-header">
                <h3 className="text-sm font-medium">Cenários automáticos (LTV máx: {result.ltvMax}%)</h3>
              </div>
              <div className="card-body p-0">
                <table className="w-full text-sm">
                  <thead className="border-b border-border/60">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left p-3">Cenário</th>
                      <th className="text-right p-3">LTV</th>
                      <th className="text-right p-3">Health Factor</th>
                      <th className="text-right p-3">Liquidação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.scenarios.map(s => (
                      <tr key={s.label} className="border-b border-border/30 last:border-0">
                        <td className="p-3 font-medium">{s.label}</td>
                        <td className="p-3 text-right">{s.ltvPct}%</td>
                        <td className="p-3 text-right">
                          <HFBadge hf={s.healthFactor} />
                        </td>
                        <td className="p-3 text-right">
                          <div>${s.liquidationPrice.toFixed(2)}</div>
                          <div className="text-xs text-muted-foreground">-{s.liquidationDropPct}%</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
