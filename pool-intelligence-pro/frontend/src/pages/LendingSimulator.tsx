/**
 * Minhas Posições de LP — Pool Performance Tracker
 * Substitui o antigo Lending Simulator.
 *
 * Funcionalidades:
 * - Registro livre de posições (tokens livres, valor em USDT, data, fee tier)
 * - Cálculo automático: lucro%, APR mensal, APY anual
 * - Benchmarks em tempo real (CDI, Poupança, S&P500, Gold) via /api/benchmarks
 * - Badge de performance com análise de IA
 * - Persistência no Supabase via /api/lp-positions
 * - Monitoramento: lista de posições salvas com dias ativos e status
 */
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Landmark, Plus, Trash2, ExternalLink, RefreshCw,
  TrendingUp, TrendingDown, Minus, AlertTriangle, Star,
  ChevronDown, ChevronUp, Pencil, Check, X, Info,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import clsx from 'clsx';
import {
  fetchBenchmarks, fetchLpPositions, createLpPosition, updateLpPosition,
  deleteLpPosition, type BenchmarksData, type LpPosition,
} from '../api/client';

// ─── Constants ───────────────────────────────────────────────────────────────

const FEE_TIERS = [
  { label: '0.01%', value: 0.01 },
  { label: '0.05%', value: 0.05 },
  { label: '0.3%', value: 0.3 },
  { label: '1%', value: 1 },
];

const CHAINS = ['ethereum', 'arbitrum', 'base', 'polygon', 'optimism'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysBetween(startDate: string): number {
  const start = new Date(startDate);
  const now = new Date();
  return Math.max(1, Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

interface CalcResult {
  totalInvested: number;
  profitPct: number;
  monthlyAPR: number;
  annualAPY: number;
  days: number;
  verdict: 'EXCELLENT' | 'ABOVE' | 'BELOW' | 'NEGATIVE';
  verdictLabel: string;
  aiText: string;
}

function calcPosition(pos: {
  token0Usd: number; token1Usd: number; feesEarned: number; startDate: string;
}, benchmarks?: BenchmarksData): CalcResult {
  const totalInvested = pos.token0Usd + pos.token1Usd;
  const days = daysBetween(pos.startDate);
  const profitPct = totalInvested > 0 ? (pos.feesEarned / totalInvested) * 100 : 0;
  const monthlyAPR = (profitPct / days) * 30;
  const annualAPY = (Math.pow(1 + monthlyAPR / 100, 12) - 1) * 100;

  const cdiMonthly = benchmarks?.cdi?.monthlyPct ?? 1.07;
  let verdict: CalcResult['verdict'];
  let verdictLabel: string;
  let aiText: string;

  if (monthlyAPR < 0) {
    verdict = 'NEGATIVE';
    verdictLabel = 'Retorno Negativo';
    aiText = `As fees acumuladas (${pos.feesEarned.toFixed(2)} USDT) ainda não cobrem o investimento de referência. Verifique se a pool está em range e se o período de análise é suficiente.`;
  } else if (monthlyAPR >= cdiMonthly * 2) {
    verdict = 'EXCELLENT';
    verdictLabel = 'Excelente — Acima do dobro do CDI';
    aiText = `Performance excepcional: ${monthlyAPR.toFixed(2)}%/mês, ${(monthlyAPR / cdiMonthly).toFixed(1)}× acima do CDI. Pool gerando valor significativo. Considere reinvestir as fees para efeito composto (APY projetado: ${annualAPY.toFixed(1)}%).`;
  } else if (monthlyAPR >= cdiMonthly) {
    verdict = 'ABOVE';
    verdictLabel = 'Acima do Mercado';
    aiText = `Pool entregando ${monthlyAPR.toFixed(2)}%/mês, acima do CDI (${cdiMonthly.toFixed(2)}%/mês). O risco de Impermanent Loss e taxas de gas está sendo compensado pelas fees. Vale manter a posição.`;
  } else if (monthlyAPR >= 0) {
    verdict = 'BELOW';
    verdictLabel = 'Abaixo do CDI';
    aiText = `Rendimento de ${monthlyAPR.toFixed(2)}%/mês está abaixo do CDI (${cdiMonthly.toFixed(2)}%/mês). Possíveis causas: pool fora de range, baixo volume ou fee tier inadequado. Avalie se vale manter ou rebalancear.`;
  } else {
    verdict = 'NEGATIVE';
    verdictLabel = 'Retorno Negativo';
    aiText = 'Fees insuficientes para este período. Verifique se a pool está ativa e dentro do range de preço.';
  }

  return { totalInvested, profitPct, monthlyAPR, annualAPY, days, verdict, verdictLabel, aiText };
}

const VERDICT_STYLE = {
  EXCELLENT: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: Star },
  ABOVE:     { color: 'text-green-400',   bg: 'bg-green-500/10',   border: 'border-green-500/30',   icon: TrendingUp },
  BELOW:     { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: Minus },
  NEGATIVE:  { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     icon: TrendingDown },
};

// ─── Benchmark Chart ──────────────────────────────────────────────────────────

function BenchmarkChart({ position, benchmarks }: { position: CalcResult; benchmarks?: BenchmarksData }) {
  const cdiMonthly = benchmarks?.cdi?.monthlyPct ?? 1.07;
  const poolRaw = position.monthlyAPR;
  const data: { name: string; value: number; raw: number; isPool: boolean }[] = [
    { name: 'Sua Pool', value: Math.max(0, poolRaw), raw: poolRaw,                              isPool: true  },
    { name: 'CDI',      value: benchmarks?.cdi?.monthlyPct ?? 1.07,      raw: 0,                isPool: false },
    { name: 'Poupança', value: benchmarks?.poupanca?.monthlyPct ?? 0.75, raw: 0,                isPool: false },
    { name: 'S&P 500',  value: benchmarks?.sp500?.monthlyPct ?? 0.79,    raw: 0,                isPool: false },
    { name: 'Ouro',     value: benchmarks?.gold?.monthlyPct ?? 0.64,     raw: 0,                isPool: false },
  ];
  const max = Math.max(...data.map(d => d.value), 0.1);

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Comparativo mensal (%/mês)</p>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" />
          <XAxis type="number" tickFormatter={v => `${v.toFixed(1)}%`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} domain={[0, max * 1.2]} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={60} />
          <Tooltip
            formatter={(v: number) => [`${v.toFixed(3)}%/mês`]}
            contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
          />
          {position.monthlyAPR > 0 && (
            <ReferenceLine x={position.monthlyAPR} stroke="#6366f1" strokeDasharray="4 2" />
          )}
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={24}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.isPool
                ? (entry.raw >= cdiMonthly * 2 ? '#10b981' : entry.raw >= cdiMonthly ? '#22c55e' : entry.raw >= 0 ? '#f59e0b' : '#ef4444')
                : '#475569'
              } />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {benchmarks && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Fontes: {benchmarks.cdi.source} · Yahoo Finance · Atualizado {new Date(benchmarks.fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          {benchmarks.allFetched === false && <span className="text-amber-400 ml-1">⚠ alguns dados offline</span>}
        </p>
      )}
    </div>
  );
}

// ─── Verdict Badge ────────────────────────────────────────────────────────────

function VerdictBadge({ calc, large = false }: { calc: CalcResult; large?: boolean }) {
  const s = VERDICT_STYLE[calc.verdict];
  const Icon = s.icon;
  return (
    <div className={clsx('rounded-xl border p-4 flex items-start gap-3', s.bg, s.border)}>
      <Icon className={clsx('shrink-0 mt-0.5', large ? 'w-6 h-6' : 'w-5 h-5', s.color)} />
      <div className="flex-1 min-w-0">
        <p className={clsx('font-bold', large ? 'text-base' : 'text-sm', s.color)}>{calc.verdictLabel}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{calc.aiText}</p>
      </div>
    </div>
  );
}

// ─── Edit Fees Row ────────────────────────────────────────────────────────────

function EditFeesRow({ position, onSave, onCancel }: {
  position: LpPosition;
  onSave: (id: string, fees: number) => void;
  onCancel: () => void;
}) {
  const [fees, setFees] = useState(position.feesEarned);
  return (
    <div className="flex items-center gap-2 mt-2">
      <span className="text-xs text-muted-foreground">Atualizar fees:</span>
      <input
        type="number" min={0} step={0.01} value={fees}
        onChange={e => setFees(parseFloat(e.target.value) || 0)}
        className="w-28 rounded bg-muted border border-border px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      <span className="text-xs text-muted-foreground">USDT</span>
      <button onClick={() => onSave(position.id, fees)} className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10 cursor-pointer transition-colors">
        <Check className="w-4 h-4" />
      </button>
      <button onClick={onCancel} className="p-1 rounded text-muted-foreground hover:bg-muted cursor-pointer transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── Position Card ────────────────────────────────────────────────────────────

function PositionCard({ position, benchmarks, onDelete, onUpdateFees }: {
  position: LpPosition;
  benchmarks?: BenchmarksData;
  onDelete: (id: string) => void;
  onUpdateFees: (id: string, fees: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const calc = useMemo(() => calcPosition(position, benchmarks), [position, benchmarks]);
  const s = VERDICT_STYLE[calc.verdict];
  const Icon = s.icon;

  return (
    <div className="card">
      <div className="card-body cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base">{position.token0}/{position.token1}</span>
              {position.protocol && <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{position.protocol}</span>}
              {position.chain && <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{position.chain}</span>}
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{position.feeTier}%</span>
              <span className={clsx('text-xs px-2 py-0.5 rounded-full font-semibold border', s.bg, s.color, s.border)}>
                <Icon className="w-3 h-3 inline mr-1" />{calc.verdictLabel.split(' — ')[0]}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 mt-2 text-sm">
              <span className="text-muted-foreground">Investido: <span className="text-foreground font-mono">${calc.totalInvested.toFixed(2)}</span></span>
              <span className="text-muted-foreground">Fees: <span className="text-emerald-400 font-mono">+${position.feesEarned.toFixed(2)}</span></span>
              <span className="text-muted-foreground">APR: <span className={clsx('font-mono font-semibold', s.color)}>{calc.monthlyAPR.toFixed(2)}%/mês</span></span>
              <span className="text-muted-foreground">{calc.days}d ativos</span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {position.poolLink && (
              <a href={position.poolLink} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="p-1.5 rounded text-muted-foreground hover:text-primary-400 hover:bg-muted transition-colors cursor-pointer">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button onClick={e => { e.stopPropagation(); onDelete(position.id); }}
              className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer" aria-label="Remover">
              <Trash2 className="w-4 h-4" />
            </button>
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="stat-card">
              <div className="stat-label">Lucro Bruto</div>
              <div className={clsx('stat-value', calc.profitPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {calc.profitPct >= 0 ? '+' : ''}{calc.profitPct.toFixed(2)}%
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">APR Mensal</div>
              <div className={clsx('stat-value', s.color)}>{calc.monthlyAPR.toFixed(2)}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">APY Anual</div>
              <div className="stat-value text-primary-400">{calc.annualAPY.toFixed(1)}%</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Entrada</div>
              <div className="stat-value text-sm">{new Date(position.startDate).toLocaleDateString('pt-BR')}</div>
            </div>
          </div>
          <VerdictBadge calc={calc} />
          <BenchmarkChart position={calc} benchmarks={benchmarks} />
          {(position.walletAddress || position.notes) && (
            <div className="text-xs text-muted-foreground space-y-1">
              {position.walletAddress && <p>Wallet: <span className="font-mono text-foreground/80">{position.walletAddress}</span></p>}
              {position.notes && <p>Notas: {position.notes}</p>}
            </div>
          )}
          <div>
            {editing ? (
              <EditFeesRow position={position} onSave={(id, fees) => { onUpdateFees(id, fees); setEditing(false); }} onCancel={() => setEditing(false)} />
            ) : (
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 cursor-pointer transition-colors">
                <Pencil className="w-3 h-3" /> Atualizar fees acumuladas
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── New Position Form ────────────────────────────────────────────────────────

interface FormState {
  token0: string; token1: string;
  token0Usd: string; token1Usd: string;
  feesEarned: string; feeTier: number;
  startDate: string; protocol: string; chain: string;
  poolLink: string; walletAddress: string; notes: string;
}

const EMPTY_FORM: FormState = {
  token0: '', token1: '', token0Usd: '', token1Usd: '',
  feesEarned: '0', feeTier: 0.3,
  startDate: new Date().toISOString().slice(0, 10),
  protocol: '', chain: '', poolLink: '', walletAddress: '', notes: '',
};

function NewPositionForm({ onSave, onCancel, benchmarks }: {
  onSave: (data: Omit<LpPosition, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
  benchmarks?: BenchmarksData;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState('');

  const preview = useMemo(() => {
    const t0 = parseFloat(form.token0Usd) || 0;
    const t1 = parseFloat(form.token1Usd) || 0;
    const fees = parseFloat(form.feesEarned) || 0;
    if ((t0 + t1) <= 0 || !form.startDate) return null;
    return calcPosition({ token0Usd: t0, token1Usd: t1, feesEarned: fees, startDate: form.startDate }, benchmarks);
  }, [form.token0Usd, form.token1Usd, form.feesEarned, form.startDate, benchmarks]);

  const set = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = useCallback(() => {
    setError('');
    if (!form.token0.trim() || !form.token1.trim()) { setError('Informe os dois tokens.'); return; }
    const t0 = parseFloat(form.token0Usd);
    const t1 = parseFloat(form.token1Usd);
    if (isNaN(t0) || t0 < 0 || isNaN(t1) || t1 < 0) { setError('Valores de investimento inválidos.'); return; }
    if (t0 + t1 === 0) { setError('O total investido deve ser maior que zero.'); return; }
    if (!form.startDate) { setError('Informe a data de entrada.'); return; }
    onSave({
      token0: form.token0.toUpperCase().trim(),
      token1: form.token1.toUpperCase().trim(),
      token0Usd: t0, token1Usd: t1,
      feesEarned: parseFloat(form.feesEarned) || 0,
      feeTier: form.feeTier,
      startDate: new Date(form.startDate).toISOString(),
      protocol: form.protocol.trim() || null,
      chain: form.chain || null,
      poolLink: form.poolLink.trim() || null,
      walletAddress: form.walletAddress.trim() || null,
      notes: form.notes.trim() || null,
    });
  }, [form, onSave]);

  const inputCls = 'w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500';

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary-400" />
          <h3 className="font-semibold text-sm">Nova Posição de LP</h3>
        </div>
        <button onClick={onCancel} className="p-1.5 rounded hover:bg-muted text-muted-foreground cursor-pointer transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="card-body space-y-5">
        {/* Tokens */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Par de Tokens</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Token 0 (nome livre)</label>
              <input className={inputCls} placeholder="ex: ETH" value={form.token0} onChange={set('token0')} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Token 1 (nome livre)</label>
              <input className={inputCls} placeholder="ex: USDC" value={form.token1} onChange={set('token1')} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Valor Token 0 em USDT no dia X</label>
              <input className={inputCls} type="number" min={0} step={0.01} placeholder="500" value={form.token0Usd} onChange={set('token0Usd')} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Valor Token 1 em USDT no dia X</label>
              <input className={inputCls} type="number" min={0} step={0.01} placeholder="500" value={form.token1Usd} onChange={set('token1Usd')} />
            </div>
          </div>
        </div>

        {/* Fees + período */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Fees Acumuladas até hoje (USDT)</label>
            <input className={inputCls} type="number" min={0} step={0.01} placeholder="0" value={form.feesEarned} onChange={set('feesEarned')} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Fee Tier da Pool</label>
            <select className={inputCls} value={form.feeTier} onChange={e => setForm(f => ({ ...f, feeTier: parseFloat(e.target.value) }))}>
              {FEE_TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Data de Entrada na Pool</label>
            <input className={inputCls} type="date" value={form.startDate} onChange={set('startDate')} max={new Date().toISOString().slice(0, 10)} />
          </div>
        </div>

        {/* Opcionais */}
        <details className="group">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1.5">
            <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform" />
            Informações opcionais — protocolo, chain, wallet, link da pool
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Protocolo</label>
              <input className={inputCls} placeholder="ex: Uniswap v3" value={form.protocol} onChange={set('protocol')} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Chain</label>
              <select className={inputCls} value={form.chain} onChange={set('chain')}>
                <option value="">Selecione...</option>
                {CHAINS.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs text-muted-foreground">Link da Pool ou Endereço de Contrato</label>
              <input className={inputCls} placeholder="https://app.uniswap.org/... ou 0x..." value={form.poolLink} onChange={set('poolLink')} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs text-muted-foreground">Endereço da Wallet (monitoramento)</label>
              <input className={inputCls} placeholder="0x..." value={form.walletAddress} onChange={set('walletAddress')} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs text-muted-foreground">Notas</label>
              <textarea className={clsx(inputCls, 'resize-none')} rows={2} placeholder="Observações sobre esta posição..." value={form.notes} onChange={set('notes')} />
            </div>
          </div>
        </details>

        {/* Preview em tempo real */}
        {preview && (
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preview</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="stat-card">
                <div className="stat-label">APR Mensal</div>
                <div className={clsx('stat-value', VERDICT_STYLE[preview.verdict].color)}>{preview.monthlyAPR.toFixed(2)}%</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">APY Anual</div>
                <div className="stat-value text-primary-400">{preview.annualAPY.toFixed(1)}%</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Dias Ativos</div>
                <div className="stat-value">{preview.days}</div>
              </div>
            </div>
            <VerdictBadge calc={preview} />
            <BenchmarkChart position={preview} benchmarks={benchmarks} />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />{error}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={handleSubmit} className="flex-1 rounded-lg bg-primary-600 hover:bg-primary-500 text-white py-2.5 text-sm font-medium transition-colors cursor-pointer">
            Salvar no Supabase
          </button>
          <button onClick={onCancel} className="px-4 rounded-lg border border-border hover:bg-muted text-muted-foreground py-2.5 text-sm transition-colors cursor-pointer">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MyLpPositions() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data: benchmarks, isLoading: loadingBench, error: benchError, refetch: refetchBench, isFetching: fetchingBench } = useQuery({
    queryKey: ['benchmarks'],
    queryFn: fetchBenchmarks,
    staleTime: 50 * 60 * 1000,
    retry: 2,
  });

  const { data: positions = [], isLoading: loadingPos } = useQuery({
    queryKey: ['lp-positions'],
    queryFn: fetchLpPositions,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: createLpPosition,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lp-positions'] }); setShowForm(false); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, feesEarned }: { id: string; feesEarned: number }) => updateLpPosition(id, { feesEarned }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lp-positions'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteLpPosition,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lp-positions'] }),
  });

  const handleSave = useCallback((data: Omit<LpPosition, 'id' | 'createdAt' | 'updatedAt'>) => {
    createMutation.mutate(data);
  }, [createMutation]);

  const handleDelete = useCallback((id: string) => {
    if (confirm('Remover esta posição do Supabase?')) deleteMutation.mutate(id);
  }, [deleteMutation]);

  const handleUpdateFees = useCallback((id: string, feesEarned: number) => {
    updateMutation.mutate({ id, feesEarned });
  }, [updateMutation]);

  const summary = useMemo(() => {
    if (positions.length === 0) return null;
    const calcs = positions.map(p => calcPosition(p, benchmarks));
    const totalInvested = calcs.reduce((s, c) => s + c.totalInvested, 0);
    const totalFees = positions.reduce((s, p) => s + p.feesEarned, 0);
    const avgMonthly = calcs.reduce((s, c) => s + c.monthlyAPR, 0) / calcs.length;
    const excellent = calcs.filter(c => c.verdict === 'EXCELLENT' || c.verdict === 'ABOVE').length;
    return { totalInvested, totalFees, avgMonthly, excellent, total: positions.length };
  }, [positions, benchmarks]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <LineChart className="w-6 h-6 text-primary-400" />
            Minhas Posições de LP
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Registre e monitore suas pools — compare com CDI, Poupança, S&P500 e Ouro em tempo real
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetchBench()} disabled={fetchingBench}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs text-muted-foreground transition-colors cursor-pointer disabled:opacity-50">
            <RefreshCw className={clsx('w-3.5 h-3.5', fetchingBench && 'animate-spin')} />
            Atualizar benchmarks
          </button>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors cursor-pointer">
            <Plus className="w-4 h-4" /> Nova Posição
          </button>
        </div>
      </div>

      {/* Benchmarks em tempo real */}
      <div className="card">
        <div className="card-body py-3">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-3.5 h-3.5 text-primary-400" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Benchmarks de Mercado — Tempo Real</span>
            {loadingBench && <span className="text-xs text-muted-foreground animate-pulse ml-2">buscando...</span>}
            {benchError && <span className="text-xs text-amber-400 ml-2">usando dados offline</span>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              { key: 'cdi',      label: 'CDI / Selic' },
              { key: 'poupanca', label: 'Poupança BR' },
              { key: 'sp500',    label: 'S&P 500' },
              { key: 'gold',     label: 'Ouro (Gold)' },
            ] as const).map(({ key, label }) => {
              const b = benchmarks?.[key] as { monthlyPct?: number; annualPct?: number; isCache?: boolean } | undefined;
              return (
                <div key={key} className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2.5">
                  <div className="text-xs text-muted-foreground mb-1">{label}</div>
                  {b ? (
                    <>
                      <div className="font-mono font-bold text-foreground">
                        {b.monthlyPct?.toFixed(3)}%<span className="text-xs text-muted-foreground font-normal">/mês</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {b.annualPct?.toFixed(2)}%/ano · {b.isCache ? '📦 cache' : '🟢 live'}
                      </div>
                    </>
                  ) : (
                    <div className="h-8 bg-muted rounded animate-pulse" />
                  )}
                </div>
              );
            })}
          </div>
          {benchmarks && !benchmarks.allFetched && (
            <p className="text-[11px] text-amber-400/80 mt-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Alguns benchmarks usam valores de referência offline. Dados reais podem variar.
            </p>
          )}
          {benchmarks && (
            <p className="text-[10px] text-muted-foreground mt-1.5">
              BCB (Selic) · Yahoo Finance (S&P500, Gold) · Poupança derivada do CDI ·
              Atualizado {new Date(benchmarks.fetchedAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
            </p>
          )}
        </div>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="stat-card">
            <div className="stat-label">Total Investido</div>
            <div className="stat-value">${summary.totalInvested.toFixed(0)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Fees Totais</div>
            <div className="stat-value text-emerald-400">+${summary.totalFees.toFixed(2)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">APR Médio</div>
            <div className={clsx('stat-value', summary.avgMonthly >= (benchmarks?.cdi?.monthlyPct ?? 1.07) ? 'text-emerald-400' : 'text-amber-400')}>
              {summary.avgMonthly.toFixed(2)}%/mês
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Acima do CDI</div>
            <div className="stat-value text-primary-400">{summary.excellent}/{summary.total}</div>
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <NewPositionForm onSave={handleSave} onCancel={() => setShowForm(false)} benchmarks={benchmarks} />
      )}
      {createMutation.isError && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Erro ao salvar. Verifique a conexão com o servidor.
        </div>
      )}

      {/* Positions */}
      {loadingPos ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="card animate-pulse p-6"><div className="h-16 bg-muted rounded" /></div>)}
        </div>
      ) : positions.length === 0 && !showForm ? (
        <div className="card p-12 text-center">
          <Landmark className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Nenhuma posição registrada</h3>
          <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
            Registre suas posições de LP para acompanhar o rendimento real e comparar com CDI, Poupança, S&P500 e Ouro em tempo real.
          </p>
          <button onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors cursor-pointer">
            <Plus className="w-4 h-4" /> Registrar minha primeira posição
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {positions.map(pos => (
            <PositionCard key={pos.id} position={pos} benchmarks={benchmarks} onDelete={handleDelete} onUpdateFees={handleUpdateFees} />
          ))}
        </div>
      )}
    </div>
  );
}
