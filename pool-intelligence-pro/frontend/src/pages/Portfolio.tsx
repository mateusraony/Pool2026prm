import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Loader2, TrendingUp, TrendingDown, Shield, PieChart,
  BarChart3, Activity, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { fetchPortfolioAnalytics, type PortfolioAnalytics } from '@/api/client';
import { GlossaryTooltip } from '@/components/common/GlossaryTooltip';
import {
  PieChart as RechartsPie, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const CHAIN_COLORS: Record<string, string> = {
  ethereum: '#627EEA', arbitrum: '#28A0F0', base: '#0052FF',
  polygon: '#8247E5', optimism: '#FF0420', bsc: '#F0B90B',
};
const PROTOCOL_COLORS = ['#06b6d4', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#6366f1'];
const TOKEN_COLORS = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ec4899', '#14b8a6', '#eab308', '#64748b'];

export default function Portfolio() {
  const navigate = useNavigate();
  const { data: analytics, isLoading } = useQuery({
    queryKey: ['portfolio-analytics'],
    queryFn: fetchPortfolioAnalytics,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  if (isLoading) {
    return (
      <MainLayout title="Portfolio Intelligence" subtitle="Analise avancada do seu portfolio de liquidez">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  const p = analytics as PortfolioAnalytics | null;

  if (!p || p.totalCapital === 0) {
    return (
      <MainLayout title="Portfolio Intelligence" subtitle="Analise avancada do seu portfolio de liquidez">
        <div className="glass-card p-12 text-center">
          <PieChart className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="font-medium mb-2">Sem posicoes ativas</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Adicione posicoes na pagina Pools Ativas para ver analytics do portfolio.
          </p>
          <button
            onClick={() => navigate('/active')}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Ir para Pools Ativas
          </button>
        </div>
      </MainLayout>
    );
  }

  const riskBandConfig = {
    conservative: { label: 'Conservador', color: 'text-success', bg: 'bg-success/8', icon: Shield },
    balanced: { label: 'Balanceado', color: 'text-primary', bg: 'bg-primary/8', icon: Activity },
    aggressive: { label: 'Agressivo', color: 'text-warning', bg: 'bg-warning/8', icon: AlertTriangle },
  };
  const rb = riskBandConfig[p.riskBand];

  return (
    <MainLayout title="Portfolio Intelligence" subtitle="Analise avancada do seu portfolio de liquidez">
      {/* Risk Band Banner */}
      <div className={cn('mb-6 rounded-xl p-4 flex items-center gap-3 border', rb.bg,
        p.riskBand === 'conservative' ? 'border-success/25' :
        p.riskBand === 'balanced' ? 'border-primary/25' : 'border-warning/25'
      )}>
        <rb.icon className={cn('h-5 w-5', rb.color)} />
        <div>
          <p className={cn('font-medium', rb.color)}>Perfil: {rb.label}</p>
          <p className="text-sm text-muted-foreground">
            Score de diversificacao: {p.diversificationScore}/100
          </p>
        </div>
        <Badge variant="outline" className="ml-auto">{p.allocationByChain.length} chains</Badge>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard label="Capital Total" value={`$${formatCompact(p.totalCapital)}`} />
        <MetricCard
          label="PnL Total"
          value={`${p.totalPnl >= 0 ? '+' : ''}$${formatCompact(p.totalPnl)}`}
          sub={`${p.totalPnlPercent >= 0 ? '+' : ''}${p.totalPnlPercent}%`}
          variant={p.totalPnl >= 0 ? 'success' : 'danger'}
        />
        <MetricCard
          label="APR Ponderado"
          value={`${p.weightedApr.toFixed(1)}%`}
          sub={`Risk-adj: ${p.riskAdjustedApr.toFixed(1)}%`}
          tooltip="riskAdjustedApr"
        />
        <MetricCard
          label="Max Drawdown"
          value={`-${p.maxDrawdown.toFixed(1)}%`}
          variant={p.maxDrawdown > 15 ? 'danger' : p.maxDrawdown > 8 ? 'warning' : 'success'}
        />
      </div>

      {/* Sharpe / Sortino / Diversification */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="glass-card p-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1"><GlossaryTooltip term="sharpe" compact>Sharpe Ratio</GlossaryTooltip></p>
          <p className={cn('font-mono text-2xl font-bold',
            (p.sharpeRatio || 0) > 1 ? 'text-success' : (p.sharpeRatio || 0) > 0.5 ? 'text-primary' : 'text-warning')}>
            {(isNaN(p.sharpeRatio) ? 0 : p.sharpeRatio).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {(p.sharpeRatio || 0) > 2 ? 'Excelente' : (p.sharpeRatio || 0) > 1 ? 'Bom' : (p.sharpeRatio || 0) > 0.5 ? 'Aceitavel' : 'Baixo'}
          </p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1"><GlossaryTooltip term="sortino" compact>Sortino Ratio</GlossaryTooltip></p>
          <p className={cn('font-mono text-2xl font-bold',
            (p.sortinoRatio || 0) > 1.5 ? 'text-success' : (p.sortinoRatio || 0) > 0.7 ? 'text-primary' : 'text-warning')}>
            {(isNaN(p.sortinoRatio) ? 0 : p.sortinoRatio).toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {(p.sortinoRatio || 0) > 2 ? 'Excelente' : (p.sortinoRatio || 0) > 1 ? 'Bom' : 'Melhorar'}
          </p>
        </div>
        <div className="glass-card p-4 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1"><GlossaryTooltip term="diversification" compact>Diversificacao</GlossaryTooltip></p>
          <div className="relative w-16 h-16 mx-auto my-1">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="hsl(var(--secondary))" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.5" fill="none"
                stroke={p.diversificationScore > 60 ? 'hsl(var(--success))' : p.diversificationScore > 30 ? 'hsl(var(--primary))' : 'hsl(var(--warning))'}
                strokeWidth="3" strokeDasharray={`${p.diversificationScore} ${100 - p.diversificationScore}`} strokeLinecap="round" />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-bold">
              {p.diversificationScore}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chain Allocation Pie */}
        <div className="glass-card p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <PieChart className="h-4 w-4 text-primary" />
            Alocacao por Chain
          </h3>
          {p.allocationByChain.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <RechartsPie>
                  <Pie data={p.allocationByChain} dataKey="capital" nameKey="chain" cx="50%" cy="50%"
                    outerRadius={70} innerRadius={40} paddingAngle={2}>
                    {p.allocationByChain.map((entry, i) => (
                      <Cell key={entry.chain} fill={CHAIN_COLORS[entry.chain.toLowerCase()] || PROTOCOL_COLORS[i % PROTOCOL_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`$${formatCompact(v)}`, 'Capital']} />
                </RechartsPie>
              </ResponsiveContainer>
              <div className="space-y-1 mt-2">
                {p.allocationByChain.map((c, i) => (
                  <div key={c.chain} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHAIN_COLORS[c.chain.toLowerCase()] || PROTOCOL_COLORS[i % PROTOCOL_COLORS.length] }} />
                      <span className="capitalize">{c.chain}</span>
                    </div>
                    <span className="font-mono text-muted-foreground">{c.percent}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
          )}
        </div>

        {/* Protocol Allocation */}
        <div className="glass-card p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Alocacao por Protocolo
          </h3>
          {p.allocationByProtocol.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={p.allocationByProtocol} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${formatCompact(v)}`} />
                <YAxis type="category" dataKey="protocol" tick={{ fontSize: 11 }} width={80} />
                <Tooltip formatter={(v: number) => [`$${formatCompact(v)}`, 'Capital']} />
                <Bar dataKey="capital" radius={[0, 4, 4, 0]}>
                  {p.allocationByProtocol.map((_, i) => (
                    <Cell key={i} fill={PROTOCOL_COLORS[i % PROTOCOL_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
          )}
        </div>

        {/* Token Exposure */}
        <div className="glass-card p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Exposicao por Token
          </h3>
          {p.allocationByToken.length > 0 ? (
            <div className="space-y-3">
              {p.allocationByToken.slice(0, 8).map((t, i) => (
                <div key={t.token}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TOKEN_COLORS[i % TOKEN_COLORS.length] }} />
                      <span className="font-medium">{t.token}</span>
                    </div>
                    <span className="font-mono text-muted-foreground">${formatCompact(t.exposure)} ({t.percent}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${Math.min(100, t.percent)}%`,
                      backgroundColor: TOKEN_COLORS[i % TOKEN_COLORS.length],
                    }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>
          )}
        </div>
      </div>

      {/* APR Comparison: Nominal vs Risk-Adjusted */}
      <div className="glass-card p-6 mt-6">
        <h3 className="font-semibold mb-4">APR: Nominal vs Risk-Adjusted</h3>
        <div className="grid grid-cols-2 gap-8 items-center">
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">APR Nominal (Ponderado)</p>
            <p className="font-mono text-3xl font-bold">{p.weightedApr.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">Media ponderada por capital</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">APR Risk-Adjusted</p>
            <p className={cn('font-mono text-3xl font-bold',
              p.riskAdjustedApr > p.weightedApr * 0.7 ? 'text-success' : 'text-warning')}>
              {p.riskAdjustedApr.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Penalidade vol: -{(p.weightedApr > 0 ? (1 - p.riskAdjustedApr / p.weightedApr) * 100 : 0).toFixed(0)}%
            </p>
          </div>
        </div>
        <div className="mt-4 flex gap-2 h-3 rounded-full overflow-hidden">
          <div className="bg-primary/60 rounded-l-full" style={{ width: `${p.weightedApr > 0 ? Math.min(100, (p.riskAdjustedApr / p.weightedApr) * 100) : 0}%` }} />
          <div className="bg-destructive/30 rounded-r-full flex-1" />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>Risk-Adjusted: {p.riskAdjustedApr.toFixed(1)}%</span>
          <span>Perda por risco: {(p.weightedApr - p.riskAdjustedApr).toFixed(1)}%</span>
        </div>
      </div>
    </MainLayout>
  );
}

function MetricCard({ label, value, sub, variant, tooltip }: {
  label: string; value: string; sub?: string;
  variant?: 'success' | 'danger' | 'warning';
  tooltip?: string;
}) {
  return (
    <div className="glass-card p-4 text-center">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {tooltip ? <GlossaryTooltip term={tooltip} compact>{label}</GlossaryTooltip> : label}
      </p>
      <p className={cn('font-mono text-2xl font-bold',
        variant === 'success' ? 'text-success' :
        variant === 'danger' ? 'text-destructive' :
        variant === 'warning' ? 'text-warning' : ''
      )}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(0);
}
