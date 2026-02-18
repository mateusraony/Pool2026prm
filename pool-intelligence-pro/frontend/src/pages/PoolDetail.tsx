import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Star, StarOff, Bell, ExternalLink, RefreshCw,
  Shield, Zap, BarChart2, AlertTriangle, TrendingUp, TrendingDown, StickyNote, Trash2, Plus,
} from 'lucide-react';
import clsx from 'clsx';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
  fetchPoolDetail, fetchFavorites, addFavorite, removeFavorite,
  fetchNotes, createNote, deleteNote,
  calcRange, UnifiedPool, RangeResult, FeeEstimate, ILRiskResult,
} from '../api/client';

// ============================================================
// HELPERS
// ============================================================

function fmt(n: number | null | undefined, prefix = '$', decimals = 2): string {
  if (n == null) return '—';
  if (n >= 1e9) return `${prefix}${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${prefix}${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${prefix}${(n / 1e3).toFixed(0)}K`;
  return `${prefix}${n.toFixed(decimals)}`;
}

function fmtPct(n: number | null | undefined, decimals = 2): string {
  if (n == null) return '—';
  return `${n.toFixed(decimals)}%`;
}

function healthBg(score: number): string {
  if (score >= 70) return 'bg-green-500/20 text-green-400';
  if (score >= 45) return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-red-500/20 text-red-400';
}

// ============================================================
// MODE SELECTOR
// ============================================================

type RiskMode = 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE';

function ModeSelector({ value, onChange }: { value: RiskMode; onChange: (m: RiskMode) => void }) {
  const modes: { id: RiskMode; label: string; icon: React.ReactNode; color: string }[] = [
    { id: 'DEFENSIVE', label: 'Defensivo', icon: <Shield className="w-4 h-4" />, color: 'border-green-500 bg-green-500/10 text-green-400' },
    { id: 'NORMAL', label: 'Normal', icon: <BarChart2 className="w-4 h-4" />, color: 'border-blue-500 bg-blue-500/10 text-blue-400' },
    { id: 'AGGRESSIVE', label: 'Agressivo', icon: <Zap className="w-4 h-4" />, color: 'border-orange-500 bg-orange-500/10 text-orange-400' },
  ];
  return (
    <div className="flex gap-2">
      {modes.map(m => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all',
            value === m.id ? m.color : 'border-dark-600 text-dark-400 hover:border-dark-500'
          )}
        >
          {m.icon}{m.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// RANGE DISPLAY
// ============================================================

function RangeDisplay({ range, price, mode }: { range: RangeResult; price: number; mode: RiskMode }) {
  const distToLower = ((price - range.lower) / price) * 100;
  const distToUpper = ((range.upper - price) / price) * 100;
  const pctInRange = (price - range.lower) / (range.upper - range.lower);
  const barPct = Math.max(5, Math.min(95, pctInRange * 100));

  const modeColors: Record<RiskMode, string> = {
    DEFENSIVE: 'bg-green-500',
    NORMAL: 'bg-blue-500',
    AGGRESSIVE: 'bg-orange-500',
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between text-sm">
        <div>
          <div className="text-dark-400 text-xs">Range Inferior</div>
          <div className="font-mono font-bold">${range.lower.toFixed(4)}</div>
          <div className="text-xs text-red-400">-{distToLower.toFixed(1)}% do atual</div>
        </div>
        <div className="text-center">
          <div className="text-dark-400 text-xs">Preço Atual</div>
          <div className="font-mono font-bold text-lg">${price.toFixed(4)}</div>
          <div className="text-xs text-dark-400">±{(range.widthPct * 100).toFixed(1)}% range</div>
        </div>
        <div className="text-right">
          <div className="text-dark-400 text-xs">Range Superior</div>
          <div className="font-mono font-bold">${range.upper.toFixed(4)}</div>
          <div className="text-xs text-green-400">+{distToUpper.toFixed(1)}% do atual</div>
        </div>
      </div>

      {/* Price bar */}
      <div className="relative h-3 bg-dark-700 rounded-full overflow-hidden">
        <div className={clsx('absolute inset-y-0 left-0 rounded-full opacity-30', modeColors[mode])} style={{ width: '100%' }} />
        <div
          className={clsx('absolute top-0 w-2 h-full rounded-full', modeColors[mode])}
          style={{ left: `calc(${barPct}% - 4px)` }}
        />
      </div>

      {range.lowerTick != null && (
        <div className="flex justify-between text-xs text-dark-500 font-mono">
          <span>Tick inf: {range.lowerTick}</span>
          <span>tickSpacing: auto</span>
          <span>Tick sup: {range.upperTick}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// FEE ESTIMATE CARD
// ============================================================

function FeeCard({ fees, capital }: { fees: FeeEstimate; capital: number }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: '24h', value: fees.expectedFees24h },
        { label: '7 dias', value: fees.expectedFees7d },
        { label: '30 dias', value: fees.expectedFees30d },
      ].map(item => (
        <div key={item.label} className="bg-dark-900 rounded-lg p-3 text-center">
          <div className="text-xs text-dark-400 mb-1">{item.label}</div>
          <div className="font-mono font-bold text-green-400">{fmt(item.value)}</div>
          <div className="text-[10px] text-dark-500 mt-0.5">
            {capital > 0 ? `${((item.value / capital) * 100).toFixed(3)}%` : '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// METRICS GRID
// ============================================================

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-dark-900 rounded-lg p-3">
      <div className="text-xs text-dark-400 mb-1">{label}</div>
      <div className={clsx('font-mono font-bold text-base', color || 'text-white')}>{value}</div>
      {sub && <div className="text-xs text-dark-500 mt-0.5">{sub}</div>}
    </div>
  );
}

// ============================================================
// NOTES SECTION
// ============================================================

function NotesSection({ poolId }: { poolId: string }) {
  const qc = useQueryClient();
  const [newNote, setNewNote] = useState('');
  const { data: notes = [] } = useQuery({ queryKey: ['notes', poolId], queryFn: () => fetchNotes(poolId) });

  const createMut = useMutation({
    mutationFn: () => createNote(poolId, newNote),
    onSuccess: () => { setNewNote(''); qc.invalidateQueries({ queryKey: ['notes', poolId] }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notes', poolId] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <textarea
          value={newNote}
          onChange={e => setNewNote(e.target.value)}
          placeholder="Adicionar nota sobre esta pool..."
          rows={2}
          className="flex-1 bg-dark-700 border border-dark-600 rounded-lg px-3 py-2 text-sm focus:border-primary-500 focus:outline-none resize-none"
        />
        <button
          onClick={() => createMut.mutate()}
          disabled={!newNote.trim() || createMut.isPending}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {notes.map(note => (
        <div key={note.id} className="flex gap-2 bg-dark-900 rounded-lg p-3">
          <div className="flex-1 text-sm text-dark-200">{note.text}</div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-dark-500">{new Date(note.createdAt).toLocaleDateString('pt-BR')}</span>
            <button onClick={() => deleteMut.mutate(note.id)} className="text-dark-500 hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ))}
      {notes.length === 0 && <p className="text-sm text-dark-500 italic">Nenhuma nota ainda.</p>}
    </div>
  );
}

// ============================================================
// MINI CHART
// ============================================================

function MiniChart({ data, dataKey, color = '#6366f1', formatter }: {
  data: Record<string, unknown>[]; dataKey: string; color?: string;
  formatter?: (v: unknown) => string;
}) {
  if (!data.length) return <div className="h-32 flex items-center justify-center text-dark-500 text-sm">Sem dados históricos</div>;
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis dataKey="ts" tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={(v: unknown) => typeof v === 'string' ? v.slice(5, 10) : ''} />
        <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} width={55} tickFormatter={(v: unknown) => typeof v === 'number' ? (v >= 1e6 ? `$${(v/1e6).toFixed(1)}M` : `$${(v/1e3).toFixed(0)}K`) : ''} />
        <Tooltip
          contentStyle={{ background: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
          labelStyle={{ color: '#9CA3AF', fontSize: 11 }}
          formatter={(v: unknown) => formatter ? formatter(v) : (typeof v === 'number' ? `$${v.toFixed(2)}` : String(v))}
        />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function PoolDetailPage() {
  const { chain, address } = useParams<{ chain: string; address: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [riskMode, setRiskMode] = useState<RiskMode>('NORMAL');
  const [horizonDays, setHorizonDays] = useState(7);
  const [capital, setCapital] = useState(1000);
  const [activeTab, setActiveTab] = useState<'price' | 'tvl' | 'volume' | 'fees'>('price');

  const { data, isLoading, error } = useQuery({
    queryKey: ['pool-detail', chain, address, horizonDays, riskMode, capital],
    queryFn: () => fetchPoolDetail(chain!, address!, { horizonDays, riskMode, capital }),
    enabled: !!chain && !!address,
    staleTime: 60000,
  });

  const { data: favorites = [] } = useQuery({ queryKey: ['favorites'], queryFn: fetchFavorites });
  const isFav = favorites.some(f => f.poolAddress.toLowerCase() === address?.toLowerCase());

  // Standalone range calc (client side, instant)
  const { data: calcData, isLoading: calcLoading } = useQuery({
    queryKey: ['range-calc', data?.pool?.price, data?.pool?.volatilityAnn, horizonDays, riskMode, capital, data?.pool?.tvlUSD, data?.pool?.fees24hUSD],
    queryFn: () => calcRange({
      price: data!.pool.price!,
      volAnn: data!.pool.volatilityAnn,
      horizonDays,
      riskMode,
      poolType: data!.pool.poolType,
      capital,
      tvl: data!.pool.tvlUSD,
      fees24h: data!.pool.fees24hUSD ?? undefined,
    }),
    enabled: !!data?.pool?.price && data.pool.price > 0,
    staleTime: 30000,
  });

  const toggleFav = useCallback(async () => {
    if (!chain || !address || !data?.pool) return;
    const pool = data.pool;
    if (isFav) {
      await removeFavorite(pool.id);
    } else {
      await addFavorite({ poolId: pool.id, chain: pool.chain, poolAddress: pool.poolAddress, token0Symbol: pool.baseToken, token1Symbol: pool.quoteToken, protocol: pool.protocol });
    }
    qc.invalidateQueries({ queryKey: ['favorites'] });
  }, [isFav, chain, address, data, qc]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-dark-400">Pool não encontrada ou erro ao carregar dados.</p>
        <button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-dark-700 rounded-lg text-sm hover:bg-dark-600 transition-colors">
          Voltar
        </button>
      </div>
    );
  }

  const pool = data.pool;
  const selectedRange = calcData?.selected ?? data.selectedRange;
  const feeEstimate = calcData?.feeEstimate ?? (data.feeEstimates?.[riskMode]);
  const ilRisk = calcData?.ilRisk ?? data.ilRisk;

  // Build chart data
  const chartData = (data.history ?? []).slice(0, 48).reverse().map((h) => ({
    ts: new Date(h.timestamp).toISOString(),
    price: h.price ?? 0,
    tvl: h.tvl,
    volume: h.volume24h,
    fees: h.fees24h ?? 0,
  }));

  const chartTabs = [
    { key: 'price', label: 'Preço', color: '#6366f1' },
    { key: 'tvl', label: 'TVL', color: '#10b981' },
    { key: 'volume', label: 'Volume', color: '#3b82f6' },
    { key: 'fees', label: 'Fees', color: '#f59e0b' },
  ] as const;

  // Build correct Uniswap URL with chain and fee tier
  const chainMap: Record<string, string> = {
    ethereum: 'mainnet',
    arbitrum: 'arbitrum',
    polygon: 'polygon',
    base: 'base',
    optimism: 'optimism',
  };
  const uniChain = chainMap[pool.chain.toLowerCase()] || 'mainnet';
  // feeTier should be in basis points (500, 3000, 10000) - convert from percentage if needed
  const feeTierBps = pool.feeTier >= 1 ? Math.round(pool.feeTier * 10000) : pool.feeTier;
  const token0Addr = pool.token0?.address || 'ETH';
  const token1Addr = pool.token1?.address || 'ETH';

  const addLiquidityUrl = pool.protocol.toLowerCase().includes('uniswap')
    ? `https://app.uniswap.org/add/${token0Addr}/${token1Addr}/${feeTierBps}?chain=${uniChain}`
    : pool.protocol.toLowerCase().includes('pancake')
    ? `https://pancakeswap.finance/add/${token0Addr}/${token1Addr}`
    : pool.protocol.toLowerCase().includes('sushi')
    ? `https://app.sushi.com/add/${token0Addr}/${token1Addr}`
    : `https://app.uniswap.org/add/${token0Addr}/${token1Addr}/${feeTierBps}?chain=${uniChain}`;

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {pool.baseToken}/{pool.quoteToken}
              {pool.bluechip && <span className="text-yellow-400 text-base">★</span>}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs bg-dark-700 px-2 py-0.5 rounded">{pool.poolType}</span>
              <span className="text-xs text-dark-400">{pool.protocol}</span>
              <span className="text-xs text-dark-400 capitalize">{pool.chain}</span>
              <span className="text-xs text-dark-500 font-mono">{pool.poolAddress.slice(0, 8)}...{pool.poolAddress.slice(-6)}</span>
              <span className={clsx('text-xs px-2 py-0.5 rounded font-bold', healthBg(pool.healthScore))}>
                Health {pool.healthScore}/100
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={toggleFav} className={clsx('p-2 rounded-lg transition-colors', isFav ? 'bg-yellow-500/20 text-yellow-400' : 'bg-dark-700 hover:bg-dark-600')}>
            {isFav ? <Star className="w-4 h-4 fill-yellow-400" /> : <StarOff className="w-4 h-4" />}
          </button>
          <button
            onClick={() => navigate(`/simulation/${pool.chain}/${pool.poolAddress}`)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg text-sm transition-colors"
          >
            <Bell className="w-4 h-4" />
            Monitorar
          </button>
          <a href={addLiquidityUrl} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 bg-dark-700 hover:bg-dark-600 rounded-lg text-sm transition-colors">
            <ExternalLink className="w-4 h-4" />
            Add Liquidity
          </a>
        </div>
      </div>

      {/* Warnings */}
      {pool.warnings.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-yellow-300">{pool.warnings.join(' · ')}</div>
        </div>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="TVL" value={fmt(pool.tvlUSD)} color="text-white" />
        <MetricCard label="APR de Fees" value={fmtPct(pool.aprFee)} color="text-green-400" sub="anualizado" />
        <MetricCard label="APR Ajustado" value={fmtPct(pool.aprAdjusted)} color="text-yellow-400" sub={`penalidade ${(pool.penaltyTotal * 100).toFixed(0)}%`} />
        <MetricCard label="Volume 24h" value={fmt(pool.volume24hUSD)} />
        <MetricCard label="Fees 24h" value={fmt(pool.fees24hUSD)} color="text-green-400" />
        <MetricCard label="Volume 1h" value={fmt(pool.volume1hUSD)} />
        <MetricCard label="Volatilidade Anual" value={fmtPct(pool.volatilityAnn * 100, 0)} color={pool.volatilityAnn > 0.5 ? 'text-red-400' : 'text-yellow-400'} />
        <MetricCard label="Fee Tier" value={`${(pool.feeTier * 100).toFixed(2)}%`} sub="por swap" />
      </div>

      {/* Charts */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
        <div className="flex border-b border-dark-700">
          {chartTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={clsx(
                'px-4 py-2.5 text-sm font-medium transition-colors border-b-2',
                activeTab === tab.key ? 'border-primary-500 text-white' : 'border-transparent text-dark-400 hover:text-white'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {chartData.length === 0 ? (
            <div className="h-28 flex items-center justify-center text-dark-500 text-sm">
              Dados históricos não disponíveis para esta pool.
            </div>
          ) : (
            <MiniChart
              data={chartData}
              dataKey={activeTab}
              color={chartTabs.find(t => t.key === activeTab)?.color ?? '#6366f1'}
            />
          )}
        </div>
      </div>

      {/* Range Calculator */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
        <div className="p-4 border-b border-dark-700">
          <h2 className="font-semibold">Calculadora de Range (CL)</h2>
          <p className="text-xs text-dark-400 mt-0.5">Baseado na volatilidade histórica com distribuição lognormal</p>
        </div>
        <div className="p-4 space-y-5">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-xs text-dark-400 mb-1.5">Modo de Risco</label>
              <ModeSelector value={riskMode} onChange={setRiskMode} />
            </div>
            <div>
              <label className="block text-xs text-dark-400 mb-1.5">Horizonte (dias)</label>
              <div className="flex gap-1">
                {[3, 7, 14, 30].map(d => (
                  <button
                    key={d}
                    onClick={() => setHorizonDays(d)}
                    className={clsx('px-3 py-1.5 rounded text-sm transition-colors', horizonDays === d ? 'bg-primary-600 text-white' : 'bg-dark-700 hover:bg-dark-600')}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-dark-400 mb-1.5">Capital (USD)</label>
              <input
                type="number"
                value={capital}
                onChange={e => setCapital(parseFloat(e.target.value) || 1000)}
                className="w-28 bg-dark-700 border border-dark-600 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-primary-500"
              />
            </div>
          </div>

          {/* Range display */}
          {calcLoading && <div className="text-center py-4"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-primary-500" /></div>}
          {selectedRange && pool.price && (
            <RangeDisplay range={selectedRange} price={pool.price} mode={riskMode} />
          )}

          {/* IL Risk + Fee Estimate */}
          {selectedRange && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-dark-900 rounded-lg p-4">
                <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                  {ilRisk?.probOutOfRange > 0.3 ? <TrendingDown className="w-4 h-4 text-red-400" /> : <TrendingUp className="w-4 h-4 text-green-400" />}
                  Risco IL em {horizonDays}d
                </h3>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs text-dark-400 mb-1">
                      <span>Chance de sair do range</span>
                      <span className={clsx('font-bold', ilRisk?.probOutOfRange > 0.4 ? 'text-red-400' : ilRisk?.probOutOfRange > 0.2 ? 'text-yellow-400' : 'text-green-400')}>
                        {fmtPct((ilRisk?.probOutOfRange ?? 0) * 100, 0)}
                      </span>
                    </div>
                    <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
                      <div
                        className={clsx('h-full rounded-full', ilRisk?.probOutOfRange > 0.4 ? 'bg-red-500' : ilRisk?.probOutOfRange > 0.2 ? 'bg-yellow-500' : 'bg-green-500')}
                        style={{ width: `${((ilRisk?.probOutOfRange ?? 0) * 100).toFixed(0)}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-dark-500 mt-2">
                    Baseado na volatilidade anualizada de {fmtPct(pool.volatilityAnn * 100, 0)} com distribuição lognormal.
                    Estimativa; resultado real depende do mercado.
                  </p>
                </div>
              </div>

              <div className="bg-dark-900 rounded-lg p-4">
                <h3 className="text-sm font-medium mb-3">Estimativa de Fees</h3>
                {feeEstimate ? (
                  <>
                    <FeeCard fees={feeEstimate} capital={capital} />
                    <p className="text-xs text-dark-500 mt-2">
                      Baseado em {fmtPct((feeEstimate.userLiquidityShare * 100), 2)} de participação na liquidez.
                      Fator de atividade k={feeEstimate.k_active} ({riskMode}).
                      Estimativa; depende da posição permanecer in-range.
                    </p>
                  </>
                ) : <p className="text-sm text-dark-500">Dados de fees não disponíveis.</p>}
              </div>
            </div>
          )}

          {/* All 3 ranges quick view */}
          {calcData && (
            <div>
              <h3 className="text-sm text-dark-400 mb-2">Comparação de Ranges</h3>
              <div className="grid grid-cols-3 gap-2">
                {(['DEFENSIVE', 'NORMAL', 'AGGRESSIVE'] as const).map(mode => {
                  const r = calcData.ranges[mode];
                  return (
                    <div key={mode} className={clsx('rounded-lg p-3 border', mode === riskMode ? 'border-primary-500 bg-primary-500/5' : 'border-dark-700 bg-dark-900')}>
                      <div className="text-xs font-medium mb-1.5">
                        {mode === 'DEFENSIVE' ? '🛡 Defensivo' : mode === 'NORMAL' ? '⚖ Normal' : '🔥 Agressivo'}
                      </div>
                      <div className="text-xs font-mono text-dark-300">${r.lower.toFixed(4)}</div>
                      <div className="text-xs text-dark-500">até</div>
                      <div className="text-xs font-mono text-dark-300">${r.upper.toFixed(4)}</div>
                      <div className="text-xs text-dark-500 mt-1">±{(r.widthPct * 100).toFixed(1)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
        <div className="p-4 border-b border-dark-700">
          <h2 className="font-semibold flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-yellow-400" />
            Minhas Notas
          </h2>
        </div>
        <div className="p-4">
          <NotesSection poolId={pool.id} />
        </div>
      </div>
    </div>
  );
}
