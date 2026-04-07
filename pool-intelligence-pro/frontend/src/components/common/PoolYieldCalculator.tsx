import { useState, useMemo, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, Zap, AlertTriangle, History,
  Calculator, DollarSign, Fuel, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer,
} from 'recharts';
import clsx from 'clsx';

// ─── Types ───────────────────────────────────────────────────────────────────

type PeriodUnit = 'days' | 'weeks';
type Verdict = 'EXCELLENT' | 'STABLE' | 'ALERT';

interface CalcResult {
  totalProfitPct: number;
  periodDays: number;
  monthlyAPR: number;
  annualAPY: number;
  simpleAPY: number;
  netYield: number;
  netMonthlyAPR: number;
  gasCost: number;
  ilCost: number;
  verdict: Verdict;
  benchmarks: BenchmarkEntry[];
}

interface BenchmarkEntry {
  name: string;
  value: number;
  isPool: boolean;
}

interface HistoryEntry {
  id: string;
  date: string;
  poolName: string;
  initial: number;
  yieldAmount: number;
  periodDays: number;
  monthlyAPR: number;
  netMonthlyAPR: number;
  verdict: Verdict;
  systemAPR: number | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CDI_MONTHLY = 0.9;   // CDI Brasil ~0.9%/mês (2025)
const SP500_MONTHLY = 0.8; // S&P500 ~0.8%/mês (média histórica)
const HISTORY_KEY = 'pool_yield_history_v1';
const MAX_HISTORY = 10;

const VERDICT_CONFIG: Record<Verdict, { label: string; color: string; icon: typeof TrendingUp; bg: string; border: string }> = {
  EXCELLENT: {
    label: 'Excelente Performance',
    color: 'text-emerald-400',
    icon: TrendingUp,
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
  },
  STABLE: {
    label: 'Performance Estável',
    color: 'text-amber-400',
    icon: Zap,
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
  },
  ALERT: {
    label: 'Alerta: Baixa Eficiência',
    color: 'text-red-400',
    icon: AlertTriangle,
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
  },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getVerdict(monthlyAPR: number): Verdict {
  if (monthlyAPR > 2) return 'EXCELLENT';
  if (monthlyAPR >= 0.5) return 'STABLE';
  return 'ALERT';
}

function getAIVerdict(
  monthlyAPR: number,
  netMonthlyAPR: number,
  ilPct: number,
  gasUsd: number,
  initial: number,
  verdict: Verdict,
): string {
  const gasPct = initial > 0 ? (gasUsd / initial) * 100 : 0;
  const spread = monthlyAPR - CDI_MONTHLY;

  if (verdict === 'EXCELLENT') {
    if (ilPct > 5)
      return `Rendimento bruto excelente (${monthlyAPR.toFixed(2)}%/mês), mas IL de ${ilPct.toFixed(1)}% é elevado. Considere reduzir o range para minimizar perda impermanente — o retorno líquido (${netMonthlyAPR.toFixed(2)}%/mês) ainda supera CDI.`;
    if (gasPct > 5)
      return `Performance forte, porém as taxas de rede (~${gasPct.toFixed(1)}% do capital) estão reduzindo o retorno real. Aumente o capital ou escolha uma chain com gas mais barato para otimizar.`;
    return `Pool com rendimento superior ao mercado em ${spread.toFixed(2)} p.p./mês vs CDI. Vale manter a posição: IL e gas estão dentro de níveis aceitáveis para o retorno gerado.`;
  }

  if (verdict === 'STABLE') {
    if (netMonthlyAPR < CDI_MONTHLY)
      return `Rendimento bruto acima do CDI, mas após IL e gas o retorno líquido (${netMonthlyAPR.toFixed(2)}%/mês) fica abaixo do CDI (${CDI_MONTHLY}%/mês). Avalie se o risco DeFi justifica continuar nesta pool.`;
    return `Rendimento estável, acima do CDI. Verifique se a pool permanece em range — saídas frequentes de range reduzem a coleta de fees e pioram o resultado líquido.`;
  }

  // ALERT
  if (netMonthlyAPR < 0)
    return `Atenção: após descontar IL (${ilPct.toFixed(1)}%) e gas ($${gasUsd.toFixed(2)}), a posição está com retorno líquido negativo. Considere fechar a posição para evitar perdas adicionais.`;
  return `Rendimento abaixo do CDI (${CDI_MONTHLY}%/mês). A pool pode estar com baixo volume ou fora do range ideal. Reavalie a estratégia ou mova para uma pool com APR mais alto.`;
}

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') as HistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-foreground">{label}</p>
      <p className="text-primary-400">{payload[0].value.toFixed(2)}%/mês</p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface PoolYieldCalculatorProps {
  poolApr?: number;       // APR do sistema para comparação
  ilEstimate?: number;    // IL estimado pela simulação (%)
  gasEstimate?: number;   // Gas estimado pela simulação (USD)
  poolName?: string;      // Nome para salvar no histórico
  poolId?: string;
  capital?: number;       // capital atual da simulação (sugestão)
}

export function PoolYieldCalculator({
  poolApr,
  ilEstimate,
  gasEstimate,
  poolName = 'Pool',
  capital: suggestedCapital = 0,
}: PoolYieldCalculatorProps) {
  // ── inputs ──
  const [initial, setInitial] = useState(suggestedCapital > 0 ? suggestedCapital : 1000);
  const [yieldAmount, setYieldAmount] = useState(0);
  const [period, setPeriod] = useState(30);
  const [periodUnit, setPeriodUnit] = useState<PeriodUnit>('days');
  const [gasFees, setGasFees] = useState(gasEstimate ?? 0);
  const [ilPct, setIlPct] = useState(ilEstimate ?? 0);

  // ── UI state ──
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [savedFlash, setSavedFlash] = useState(false);

  // ── computed ──
  const result = useMemo<CalcResult | null>(() => {
    if (initial <= 0 || yieldAmount < 0 || period <= 0) return null;

    const periodDays = periodUnit === 'weeks' ? period * 7 : period;
    if (periodDays === 0) return null;

    const totalProfitPct = (yieldAmount / initial) * 100;
    const monthlyAPR = (totalProfitPct / periodDays) * 30;
    const annualAPY = (Math.pow(1 + monthlyAPR / 100, 12) - 1) * 100;
    const simpleAPY = (totalProfitPct / periodDays) * 365;

    const ilCost = (initial * ilPct) / 100;
    const gasCost = gasFees;
    const netYield = yieldAmount - gasCost - ilCost;
    const netMonthlyAPR = (netYield / initial / periodDays) * 30 * 100;

    const verdict = getVerdict(monthlyAPR);

    const benchmarks: BenchmarkEntry[] = [
      { name: 'Sua Pool', value: monthlyAPR, isPool: true },
      { name: 'CDI Brasil', value: CDI_MONTHLY, isPool: false },
      { name: 'S&P 500', value: SP500_MONTHLY, isPool: false },
    ];

    return {
      totalProfitPct, periodDays, monthlyAPR, annualAPY, simpleAPY,
      netYield, netMonthlyAPR, gasCost, ilCost, verdict, benchmarks,
    };
  }, [initial, yieldAmount, period, periodUnit, gasFees, ilPct]);

  const aiVerdict = useMemo(() => {
    if (!result) return '';
    return getAIVerdict(result.monthlyAPR, result.netMonthlyAPR, ilPct, gasFees, initial, result.verdict);
  }, [result, ilPct, gasFees, initial]);

  // ── actions ──
  const handleSave = useCallback(() => {
    if (!result) return;
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString('pt-BR'),
      poolName,
      initial,
      yieldAmount,
      periodDays: result.periodDays,
      monthlyAPR: result.monthlyAPR,
      netMonthlyAPR: result.netMonthlyAPR,
      verdict: result.verdict,
      systemAPR: poolApr ? poolApr / 12 : null, // convert annual to monthly
    };
    const updated = [entry, ...history];
    setHistory(updated);
    saveHistory(updated);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }, [result, poolName, initial, yieldAmount, history, poolApr]);

  const handleDeleteHistory = useCallback((id: string) => {
    const updated = history.filter(e => e.id !== id);
    setHistory(updated);
    saveHistory(updated);
  }, [history]);

  // ── bar chart colors ──
  const barColor = (entry: BenchmarkEntry) => {
    if (!entry.isPool) return '#64748b';
    if (entry.value > 2) return '#10b981';
    if (entry.value >= 0.5) return '#f59e0b';
    return '#ef4444';
  };

  // ── render ──
  return (
    <div className="card">
      <div className="card-header flex items-center gap-2">
        <Calculator className="w-4 h-4 text-primary-400" />
        <h3 className="font-semibold text-sm">Calculadora de Rendimento Real</h3>
        <span className="ml-auto text-xs text-muted-foreground">Compare e salve histórico</span>
      </div>

      <div className="card-body space-y-6">

        {/* ── Inputs ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {/* Initial */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <DollarSign className="w-3 h-3" /> Valor Inicial (USD)
            </label>
            <input
              type="number"
              min={0}
              value={initial}
              onChange={e => setInitial(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="1000"
            />
          </div>

          {/* Yield */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Rendimento Acumulado (USD)
            </label>
            <input
              type="number"
              min={0}
              value={yieldAmount}
              onChange={e => setYieldAmount(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="0"
            />
          </div>

          {/* Period */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              Período
            </label>
            <div className="flex gap-1">
              <input
                type="number"
                min={1}
                value={period}
                onChange={e => setPeriod(parseInt(e.target.value) || 1)}
                className="flex-1 rounded-lg bg-muted border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="30"
              />
              <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
                <button
                  onClick={() => setPeriodUnit('days')}
                  className={clsx(
                    'px-2 py-2 transition-colors cursor-pointer',
                    periodUnit === 'days' ? 'bg-primary-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70',
                  )}
                >
                  Dias
                </button>
                <button
                  onClick={() => setPeriodUnit('weeks')}
                  className={clsx(
                    'px-2 py-2 transition-colors cursor-pointer',
                    periodUnit === 'weeks' ? 'bg-primary-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/70',
                  )}
                >
                  Sem
                </button>
              </div>
            </div>
          </div>

          {/* Gas Fees */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Fuel className="w-3 h-3" /> Gas Fees (USD)
              {gasEstimate != null && gasEstimate > 0 && (
                <button
                  onClick={() => setGasFees(gasEstimate)}
                  className="text-primary-400 hover:text-primary-300 text-[10px] cursor-pointer"
                >
                  usar estimativa
                </button>
              )}
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={gasFees}
              onChange={e => setGasFees(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="0"
            />
          </div>

          {/* IL */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              IL Estimado (%)
              {ilEstimate != null && ilEstimate > 0 && (
                <button
                  onClick={() => setIlPct(ilEstimate)}
                  className="text-primary-400 hover:text-primary-300 text-[10px] cursor-pointer"
                >
                  usar simulação
                </button>
              )}
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={ilPct}
              onChange={e => setIlPct(parseFloat(e.target.value) || 0)}
              className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="0"
            />
          </div>

          {/* System APR hint */}
          {poolApr != null && poolApr > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">APR do Sistema</label>
              <div className="rounded-lg bg-primary-500/10 border border-primary-500/20 px-3 py-2 text-sm">
                <span className="text-primary-400 font-semibold">{poolApr.toFixed(1)}%</span>
                <span className="text-muted-foreground text-xs ml-1">/ ano</span>
                <div className="text-xs text-muted-foreground mt-0.5">
                  ≈ {(poolApr / 12).toFixed(2)}%/mês estimado
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Results ── */}
        {result && (
          <>
            {/* Performance Badge */}
            {(() => {
              const vc = VERDICT_CONFIG[result.verdict];
              const Icon = vc.icon;
              return (
                <div className={clsx('rounded-xl border p-4 flex items-center gap-3', vc.bg, vc.border)}>
                  <Icon className={clsx('w-6 h-6 shrink-0', vc.color)} />
                  <div className="flex-1">
                    <div className={clsx('font-bold text-base', vc.color)}>{vc.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {result.monthlyAPR.toFixed(2)}%/mês  •  APY {result.annualAPY.toFixed(1)}%  •  {result.periodDays}d analisados
                    </div>
                  </div>
                  {poolApr != null && (
                    <div className="text-right text-xs shrink-0">
                      <div className="text-muted-foreground">vs sistema</div>
                      <div className={clsx(
                        'font-semibold',
                        result.monthlyAPR >= poolApr / 12 ? 'text-emerald-400' : 'text-amber-400',
                      )}>
                        {result.monthlyAPR >= poolApr / 12 ? '▲' : '▼'}{' '}
                        {Math.abs(result.monthlyAPR - poolApr / 12).toFixed(2)} p.p.
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="stat-card">
                <div className="stat-label">Lucro Total</div>
                <div className="stat-value text-emerald-400">{result.totalProfitPct.toFixed(2)}%</div>
                <div className="text-xs text-muted-foreground">${yieldAmount.toFixed(2)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">APR Mensal</div>
                <div className={clsx(
                  'stat-value',
                  result.monthlyAPR > 2 ? 'text-emerald-400' : result.monthlyAPR >= 0.5 ? 'text-amber-400' : 'text-red-400',
                )}>
                  {result.monthlyAPR.toFixed(2)}%
                </div>
                <div className="text-xs text-muted-foreground">projeção</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">APY Anual</div>
                <div className="stat-value text-primary-400">{result.annualAPY.toFixed(1)}%</div>
                <div className="text-xs text-muted-foreground">composto mensal</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">APR Líquido/Mês</div>
                <div className={clsx(
                  'stat-value',
                  result.netMonthlyAPR > 0 ? 'text-emerald-400' : 'text-red-400',
                )}>
                  {result.netMonthlyAPR.toFixed(2)}%
                </div>
                <div className="text-xs text-muted-foreground">após IL + gas</div>
              </div>
            </div>

            {/* Real Exit Yield Table */}
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Rendimento Real na Saída
              </div>
              <div className="divide-y divide-border">
                <div className="flex justify-between items-center px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">Rendimento Bruto</span>
                  <span className="font-mono text-emerald-400">+${yieldAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Fuel className="w-3.5 h-3.5" /> Taxas de Rede (Gas)
                  </span>
                  <span className="font-mono text-red-400">-${result.gasCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <TrendingDown className="w-3.5 h-3.5" /> Impermanent Loss ({ilPct.toFixed(1)}%)
                  </span>
                  <span className="font-mono text-red-400">-${result.ilCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center px-4 py-3 text-sm font-semibold bg-muted/20">
                  <span>Rendimento Líquido</span>
                  <div className="text-right">
                    <span className={clsx('font-mono text-base', result.netYield >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {result.netYield >= 0 ? '+' : ''}${result.netYield.toFixed(2)}
                    </span>
                    <span className={clsx('ml-2 text-xs', result.netYield >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      ({result.totalProfitPct > 0 ? ((result.netYield / initial) * 100).toFixed(2) : '0.00'}%)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Benchmark Comparison Chart */}
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Comparativo de Mercado — %/mês
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={result.benchmarks} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" />
                  <XAxis
                    type="number"
                    tickFormatter={v => `${v}%`}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    width={65}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99,102,241,0.08)' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {result.benchmarks.map((entry, i) => (
                      <Cell key={i} fill={barColor(entry)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" />
                  CDI Brasil ~{CDI_MONTHLY}%/mês
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block" />
                  S&P500 ~{SP500_MONTHLY}%/mês (média)
                </span>
              </div>
            </div>

            {/* AI Verdict */}
            <div className="rounded-xl bg-muted/30 border border-border p-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-primary-400" />
                Veredito da Análise
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed">{aiVerdict}</p>
              {poolApr != null && (
                <div className="mt-2.5 text-xs text-muted-foreground border-t border-border/60 pt-2.5">
                  Sistema estimou {(poolApr / 12).toFixed(2)}%/mês — você realizou {result.monthlyAPR.toFixed(2)}%/mês
                  {result.monthlyAPR >= poolApr / 12
                    ? ' ✓ acima da estimativa'
                    : ' — abaixo da estimativa do sistema'}.
                </div>
              )}
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              className={clsx(
                'w-full rounded-lg py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer',
                savedFlash
                  ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-400'
                  : 'bg-primary-600/20 border border-primary-600/40 text-primary-400 hover:bg-primary-600/30',
              )}
            >
              {savedFlash ? 'Salvo no histórico!' : 'Salvar no Histórico'}
            </button>
          </>
        )}

        {!result && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Preencha os campos acima para calcular o rendimento
          </div>
        )}

        {/* ── History ── */}
        {history.length > 0 && (
          <div className="border-t border-border pt-4">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-full"
            >
              <History className="w-4 h-4" />
              <span className="font-medium">Histórico ({history.length})</span>
              {showHistory ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
            </button>

            {showHistory && (
              <div className="mt-3 space-y-2">
                {history.map(entry => {
                  const vc = VERDICT_CONFIG[entry.verdict];
                  return (
                    <div key={entry.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-foreground">{entry.poolName}</span>
                            <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full font-medium', vc.bg, vc.color, vc.border, 'border')}>
                              {vc.label.split(':')[0]}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                            <span>{entry.date}</span>
                            <span>${entry.initial.toFixed(0)} inicial</span>
                            <span>{entry.periodDays}d</span>
                            <span className={clsx(entry.monthlyAPR > CDI_MONTHLY ? 'text-emerald-400' : 'text-amber-400', 'font-mono')}>
                              {entry.monthlyAPR.toFixed(2)}%/mês bruto
                            </span>
                            <span className={clsx(entry.netMonthlyAPR > 0 ? 'text-emerald-400' : 'text-red-400', 'font-mono')}>
                              {entry.netMonthlyAPR.toFixed(2)}%/mês líquido
                            </span>
                            {entry.systemAPR != null && (
                              <span className="text-primary-400/70">
                                sistema: {entry.systemAPR.toFixed(2)}%/mês
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteHistory(entry.id)}
                          className="text-muted-foreground hover:text-red-400 transition-colors cursor-pointer shrink-0 p-1"
                          aria-label="Remover entrada"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
