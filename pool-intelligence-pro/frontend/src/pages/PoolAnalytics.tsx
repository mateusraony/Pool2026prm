import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Loader2, BarChart3, TrendingUp, TrendingDown,
  Shield, Zap, Activity, AlertTriangle,
} from 'lucide-react';
import {
  runMonteCarlo, runBacktest, fetchLVR, runAutoCompound,
  type MonteCarloResult, type BacktestResult, type LVRResult, type AutoCompoundResult,
} from '@/api/client';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const fmtRatio = (v: number | null | undefined) => {
  if (v == null || !isFinite(v) || isNaN(v)) return '∞';
  return v.toFixed(2);
};

const barPct = (ratio: number) => {
  if (!isFinite(ratio) || isNaN(ratio) || ratio <= 0) return 100;
  return Math.min(100, (ratio / (ratio + 1)) * 100);
};

const MODE_OPTIONS = [
  { value: 'DEFENSIVE', label: 'Defensivo' },
  { value: 'NORMAL', label: 'Otimizado' },
  { value: 'AGGRESSIVE', label: 'Agressivo' },
];

const CAPITAL_PRESETS = [1000, 5000, 10000, 25000, 50000];

export default function PoolAnalytics() {
  const { chain, address } = useParams<{ chain: string; address: string }>();
  const navigate = useNavigate();
  const [capital, setCapital] = useState(10000);
  const [mode, setMode] = useState('NORMAL');
  const [horizonDays, setHorizonDays] = useState(30);
  const [compoundFreq, setCompoundFreq] = useState('weekly');

  // Monte Carlo
  const mcMutation = useMutation({
    mutationFn: () => runMonteCarlo({ chain: chain!, address: address!, capital, horizonDays, mode, scenarios: 2000 }),
  });

  // Backtest
  const btMutation = useMutation({
    mutationFn: () => runBacktest({ chain: chain!, address: address!, capital, periodDays: horizonDays, mode }),
  });

  // Auto-Compound
  const acMutation = useMutation({
    mutationFn: () => runAutoCompound({
      chain: chain!, address: address!, capital, periodDays: horizonDays,
      compoundFrequency: compoundFreq, gasPerCompound: 2.5,
    }),
  });

  // LVR
  const { data: lvrData, isLoading: lvrLoading } = useQuery({
    queryKey: ['lvr', chain, address, capital, mode],
    queryFn: () => fetchLVR({ chain: chain!, address: address!, capital, mode }),
    enabled: !!chain && !!address,
    staleTime: 60000,
  });

  const runAll = () => {
    mcMutation.mutate();
    btMutation.mutate();
  };

  const mc = mcMutation.data as MonteCarloResult | null | undefined;
  const bt = btMutation.data as BacktestResult | null | undefined;
  const lvr = lvrData as LVRResult | null | undefined;
  const ac = acMutation.data as AutoCompoundResult | null | undefined;
  const isRunning = mcMutation.isPending || btMutation.isPending;

  return (
    <MainLayout title="Analytics Institucional" subtitle={`${chain}/${address?.slice(0, 8)}...`}>
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
      </Button>

      {/* Controls */}
      <div className="glass-card p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Capital</label>
            <div className="flex gap-1">
              {CAPITAL_PRESETS.map(c => (
                <button key={c} onClick={() => setCapital(c)}
                  className={cn('px-2 py-1 rounded text-xs font-mono', capital === c ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground hover:bg-secondary')}>
                  ${(c / 1000).toFixed(0)}k
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Modo</label>
            <div className="flex gap-1">
              {MODE_OPTIONS.map(m => (
                <button key={m.value} onClick={() => setMode(m.value)}
                  className={cn('px-2 py-1 rounded text-xs', mode === m.value ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground hover:bg-secondary')}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Horizonte</label>
            <div className="flex gap-1">
              {[7, 30, 90, 180].map(d => (
                <button key={d} onClick={() => setHorizonDays(d)}
                  className={cn('px-2 py-1 rounded text-xs font-mono', horizonDays === d ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground hover:bg-secondary')}>
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <Button onClick={runAll} disabled={isRunning} className="ml-auto">
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
            Executar Analise
          </Button>
        </div>
      </div>

      <Tabs defaultValue="monte-carlo">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="monte-carlo">Monte Carlo</TabsTrigger>
          <TabsTrigger value="backtest">Backtest</TabsTrigger>
          <TabsTrigger value="lvr">LVR & Risco</TabsTrigger>
          <TabsTrigger value="compound">Compound</TabsTrigger>
        </TabsList>

        {/* MONTE CARLO TAB */}
        <TabsContent value="monte-carlo" className="space-y-4">
          {!mc && !mcMutation.isPending && (
            <div className="glass-card p-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="font-medium mb-2">Monte Carlo Simulation</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Simula milhares de cenarios de preco usando Geometric Brownian Motion.
                Mostra distribuicao de retornos, probabilidade de lucro e cenarios extremos.
              </p>
              <Button onClick={() => mcMutation.mutate()} disabled={mcMutation.isPending}>
                Executar Simulacao
              </Button>
            </div>
          )}

          {mcMutation.isPending && (
            <div className="glass-card p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
              <p className="text-muted-foreground">Executando {2000} cenarios...</p>
            </div>
          )}

          {mc && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-card p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Prob. Lucro</p>
                  <p className={cn('font-mono text-2xl font-bold', mc.probProfit > 50 ? 'text-success' : 'text-destructive')}>
                    {mc.probProfit}%
                  </p>
                </div>
                <div className="glass-card p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">PnL Medio</p>
                  <p className={cn('font-mono text-2xl font-bold', mc.avgPnl >= 0 ? 'text-success' : 'text-destructive')}>
                    ${mc.avgPnl.toFixed(0)}
                  </p>
                </div>
                <div className="glass-card p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Prob. Fora do Range</p>
                  <p className={cn('font-mono text-2xl font-bold', mc.probOutOfRange > 30 ? 'text-warning' : 'text-success')}>
                    {mc.probOutOfRange}%
                  </p>
                </div>
                <div className="glass-card p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Cenarios</p>
                  <p className="font-mono text-2xl font-bold">{mc.scenarios}</p>
                </div>
              </div>

              {/* Distribution Chart */}
              <div className="glass-card p-6">
                <h3 className="font-semibold mb-4">Distribuicao de Retornos</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={mc.distribution}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Percentiles Table */}
              <div className="glass-card p-6">
                <h3 className="font-semibold mb-4">Cenarios por Percentil</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left py-2 text-muted-foreground font-medium">Cenario</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Preco Final</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Variacao</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">Fees</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">IL</th>
                        <th className="text-right py-2 text-muted-foreground font-medium">PnL</th>
                        <th className="text-center py-2 text-muted-foreground font-medium">Range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Pior caso', data: mc.worstCase, style: 'text-destructive' },
                        { label: 'Pessimista (P5)', data: mc.percentiles.p5, style: 'text-destructive' },
                        { label: 'Conservador (P25)', data: mc.percentiles.p25, style: 'text-warning' },
                        { label: 'Mediana (P50)', data: mc.percentiles.p50, style: '' },
                        { label: 'Otimista (P75)', data: mc.percentiles.p75, style: 'text-success' },
                        { label: 'Muito Otimista (P95)', data: mc.percentiles.p95, style: 'text-success' },
                        { label: 'Melhor caso', data: mc.bestCase, style: 'text-success font-bold' },
                      ].map(row => (
                        <tr key={row.label} className="border-b border-border/20">
                          <td className={cn('py-2', row.style)}>{row.label}</td>
                          <td className="py-2 text-right font-mono">${row.data.finalPrice.toFixed(4)}</td>
                          <td className={cn('py-2 text-right font-mono', row.data.priceChange >= 0 ? 'text-success' : 'text-destructive')}>
                            {row.data.priceChange >= 0 ? '+' : ''}{row.data.priceChange}%
                          </td>
                          <td className="py-2 text-right font-mono text-success">+${row.data.feesEarned}</td>
                          <td className="py-2 text-right font-mono text-destructive">-${row.data.ilLoss}</td>
                          <td className={cn('py-2 text-right font-mono font-medium', row.data.pnl >= 0 ? 'text-success' : 'text-destructive')}>
                            {row.data.pnl >= 0 ? '+' : ''}${row.data.pnl}
                          </td>
                          <td className="py-2 text-center">
                            {row.data.isInRange ? (
                              <Badge variant="outline" className="text-success border-success/30">In</Badge>
                            ) : (
                              <Badge variant="outline" className="text-destructive border-destructive/30">Out</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* BACKTEST TAB */}
        <TabsContent value="backtest" className="space-y-4">
          {!bt && !btMutation.isPending && (
            <div className="glass-card p-12 text-center">
              <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="font-medium mb-2">Backtest de Range</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Simula performance historica da estrategia de range.
                Calcula fees acumuladas, IL, max drawdown e tempo em range.
              </p>
              <Button onClick={() => btMutation.mutate()} disabled={btMutation.isPending}>
                Executar Backtest
              </Button>
            </div>
          )}

          {btMutation.isPending && (
            <div className="glass-card p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
              <p className="text-muted-foreground">Executando backtest de {horizonDays} dias...</p>
            </div>
          )}

          {bt && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-card p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">PnL Net</p>
                  <p className={cn('font-mono text-2xl font-bold', bt.netPnl >= 0 ? 'text-success' : 'text-destructive')}>
                    ${bt.netPnl.toFixed(0)}
                  </p>
                  <p className="text-xs text-muted-foreground">{bt.netPnlPercent}%</p>
                </div>
                <div className="glass-card p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Max Drawdown</p>
                  <p className={cn('font-mono text-2xl font-bold', bt.maxDrawdown > 5 ? 'text-destructive' : 'text-warning')}>
                    -{bt.maxDrawdown}%
                  </p>
                </div>
                <div className="glass-card p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tempo em Range</p>
                  <p className={cn('font-mono text-2xl font-bold', bt.timeInRange > 70 ? 'text-success' : 'text-warning')}>
                    {bt.timeInRange}%
                  </p>
                </div>
                <div className="glass-card p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Rebalanceamentos</p>
                  <p className="font-mono text-2xl font-bold">{bt.rebalances}</p>
                </div>
              </div>

              {/* Cumulative PnL Chart */}
              <div className="glass-card p-6">
                <h3 className="font-semibold mb-4">PnL Acumulado</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={bt.dailyReturns}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} label={{ value: 'Dia', position: 'insideBottom', offset: -5, fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => [`$${v.toFixed(2)}`, '']} />
                    <Area type="monotone" dataKey="fees" stackId="1" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.2} name="Fees" />
                    <Area type="monotone" dataKey="il" stackId="2" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.1} name="IL" />
                    <Line type="monotone" dataKey="cumPnl" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="PnL Net" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-3 gap-4">
                <div className="glass-card p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fees Totais</p>
                  <p className="font-mono text-xl text-success">+${bt.totalFees.toFixed(2)}</p>
                </div>
                <div className="glass-card p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">IL Total</p>
                  <p className="font-mono text-xl text-destructive">-${bt.totalIL.toFixed(2)}</p>
                </div>
                <div className={cn('glass-card p-4 text-center', bt.netPnl >= 0 ? 'bg-success/5' : 'bg-destructive/5')}>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Resultado</p>
                  <p className={cn('font-mono text-xl font-bold', bt.netPnl >= 0 ? 'text-success' : 'text-destructive')}>
                    {bt.netPnl >= 0 ? '+' : ''}${bt.netPnl.toFixed(2)}
                  </p>
                </div>
              </div>
            </>
          )}
        </TabsContent>

        {/* LVR TAB */}
        <TabsContent value="lvr" className="space-y-4">
          {lvrLoading && (
            <div className="glass-card p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            </div>
          )}

          {lvr && (
            <>
              <div className="glass-card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Shield className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">Loss-Versus-Rebalancing (LVR)</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  LVR mede o custo de selecao adversa de prover liquidez.
                  Quanto maior a volatilidade, maior o LVR. Fees devem superar LVR para ser lucrativo.
                </p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="rounded-lg bg-secondary/30 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">LVR Diario</p>
                    <p className="font-mono text-lg text-destructive">${lvr.lvrDaily}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">LVR Anual</p>
                    <p className="font-mono text-lg text-destructive">${lvr.lvrAnnualized}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">LVR % Capital</p>
                    <p className="font-mono text-lg">{lvr.lvrPercent}%</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Fee/LVR Ratio</p>
                    <p className={cn('font-mono text-lg font-bold', lvr.feeToLvrRatio > 1.5 ? 'text-success' : lvr.feeToLvrRatio > 0.8 ? 'text-warning' : 'text-destructive')}>
                      {fmtRatio(lvr.feeToLvrRatio)}x
                    </p>
                  </div>
                </div>

                {/* Fee vs LVR visual bar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>Fees Diarias</span>
                    <span>LVR Diario</span>
                  </div>
                  <div className="flex gap-1 h-6 rounded-lg overflow-hidden">
                    <div className="bg-success/60 rounded-l-lg flex items-center justify-center text-[10px] text-white font-mono"
                      style={{ width: `${barPct(lvr.feeToLvrRatio)}%` }}>
                      Fees
                    </div>
                    <div className="bg-destructive/60 rounded-r-lg flex items-center justify-center text-[10px] text-white font-mono"
                      style={{ width: `${100 - barPct(lvr.feeToLvrRatio)}%` }}>
                      LVR
                    </div>
                  </div>
                </div>

                {/* Verdict */}
                <div className={cn(
                  'rounded-lg p-4 text-center',
                  lvr.verdict === 'profitable' ? 'bg-success/8 border border-success/20' :
                  lvr.verdict === 'marginal' ? 'bg-warning/8 border border-warning/20' :
                  'bg-destructive/8 border border-destructive/20'
                )}>
                  <div className="flex items-center justify-center gap-2 mb-1">
                    {lvr.verdict === 'profitable' ? <TrendingUp className="h-5 w-5 text-success" /> :
                     lvr.verdict === 'marginal' ? <AlertTriangle className="h-5 w-5 text-warning" /> :
                     <TrendingDown className="h-5 w-5 text-destructive" />}
                    <span className={cn('font-medium',
                      lvr.verdict === 'profitable' ? 'text-success' :
                      lvr.verdict === 'marginal' ? 'text-warning' : 'text-destructive'
                    )}>
                      {lvr.verdict === 'profitable' ? 'Lucrativo — Fees superam LVR' :
                       lvr.verdict === 'marginal' ? 'Marginal — Fees proximo do LVR' :
                       'Nao Lucrativo — LVR supera Fees'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Resultado liquido diario apos LVR:{' '}
                    <span className={cn('font-mono font-medium', lvr.netAfterLvr >= 0 ? 'text-success' : 'text-destructive')}>
                      {lvr.netAfterLvr >= 0 ? '+' : ''}${lvr.netAfterLvr}/dia
                    </span>
                  </p>
                </div>
              </div>

              {/* Pool Data */}
              <div className="glass-card p-4">
                <h4 className="text-sm font-medium mb-2 text-muted-foreground">Dados da Pool</h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-secondary/30 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">TVL</p>
                    <p className="font-mono text-sm">${(lvr.pool.tvl / 1e6).toFixed(1)}M</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Fees/24h</p>
                    <p className="font-mono text-sm">${lvr.pool.fees24h.toFixed(0)}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">Volatilidade</p>
                    <p className="font-mono text-sm">{(lvr.pool.volatility * 100).toFixed(1)}%</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </TabsContent>
        {/* AUTO-COMPOUND TAB */}
        <TabsContent value="compound" className="space-y-4">
          {!ac && !acMutation.isPending && (
            <div className="glass-card p-12 text-center">
              <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
              <h3 className="font-medium mb-2">Auto-Compound Simulator</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Compare retornos com e sem auto-compound.
                Descubra a frequencia ideal considerando custos de gas.
              </p>
              <div className="flex gap-2 justify-center mb-4">
                {(['daily', 'weekly', 'biweekly', 'monthly'] as const).map(f => (
                  <button key={f} onClick={() => setCompoundFreq(f)}
                    className={cn('px-3 py-1 rounded text-xs',
                      compoundFreq === f ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 text-muted-foreground hover:bg-secondary')}>
                    {{ daily: 'Diario', weekly: 'Semanal', biweekly: 'Quinzenal', monthly: 'Mensal' }[f]}
                  </button>
                ))}
              </div>
              <Button onClick={() => acMutation.mutate()} disabled={acMutation.isPending}>
                Simular Compound
              </Button>
            </div>
          )}

          {acMutation.isPending && (
            <div className="glass-card p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
              <p className="text-muted-foreground">Simulando auto-compound...</p>
            </div>
          )}

          {ac && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass-card p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sem Compound</p>
                  <p className="font-mono text-xl">${ac.withoutCompound.toLocaleString()}</p>
                </div>
                <div className="glass-card p-4 text-center bg-success/5">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Com Compound</p>
                  <p className="font-mono text-xl text-success">${ac.withCompound.toLocaleString()}</p>
                </div>
                <div className="glass-card p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Ganho Extra</p>
                  <p className={cn('font-mono text-xl font-bold', ac.compoundBenefit > 0 ? 'text-success' : 'text-destructive')}>
                    +${ac.compoundBenefit.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">+{ac.compoundBenefitPercent}%</p>
                </div>
                <div className="glass-card p-4 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Freq. Ideal</p>
                  <p className="font-mono text-xl">{ac.optimalFrequency}</p>
                  <p className="text-xs text-muted-foreground">Gas: ${ac.gasCostEstimate}</p>
                </div>
              </div>

              {/* Growth Chart */}
              <div className="glass-card p-6">
                <h3 className="font-semibold mb-4">Crescimento: Simples vs Compound</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={ac.schedule}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} label={{ value: 'Periodo', position: 'insideBottom', offset: -5, fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                    <Tooltip formatter={(v: number) => [`$${v.toLocaleString()}`, '']} />
                    <Line type="monotone" dataKey="valueSimple" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="5 5" dot={false} name="Simples" />
                    <Line type="monotone" dataKey="valueCompound" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="Compound" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
