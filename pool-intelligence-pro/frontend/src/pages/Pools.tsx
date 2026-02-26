import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ChevronUp, ChevronDown, ChevronsUpDown, Star, StarOff,
  RefreshCw, Filter, Search, Shield, Zap, BarChart2, AlertTriangle, ExternalLink,
} from 'lucide-react';
import clsx from 'clsx';
import { fetchUnifiedPools, fetchTokens, fetchFavorites, addFavorite, removeFavorite, UnifiedPool } from '../api/client';

// ============================================================
// HELPERS
// ============================================================

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(decimals)}`;
}

function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—';
  return `${n.toFixed(decimals)}%`;
}

function healthColor(score: number): string {
  if (score >= 70) return 'text-green-400';
  if (score >= 45) return 'text-yellow-400';
  return 'text-red-400';
}

function healthBg(score: number): string {
  if (score >= 70) return 'bg-green-500/20 text-green-400';
  if (score >= 45) return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-red-500/20 text-red-400';
}

type SortKey = 'tvl' | 'apr' | 'aprFee' | 'aprAdjusted' | 'volume1h' | 'volume5m' | 'fees1h' | 'healthScore' | 'volatilityAnn' | 'ratio';

// ============================================================
// SORT HEADER
// ============================================================

function SortHeader({ label, sortKey, current, dir, onSort }: {
  label: string; sortKey: SortKey; current: SortKey;
  dir: 'asc' | 'desc'; onSort: (k: SortKey) => void;
}) {
  const active = current === sortKey;
  return (
    <th
      className="px-3 py-2 text-xs font-medium text-dark-400 cursor-pointer hover:text-white whitespace-nowrap select-none"
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-1">
        {label}
        {active ? (dir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />) : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
      </span>
    </th>
  );
}

// ============================================================
// POOL ROW
// ============================================================

function PoolRow({ pool, isFav, onToggleFav, onClick }: {
  pool: UnifiedPool; isFav: boolean;
  onToggleFav: (pool: UnifiedPool) => void;
  onClick: (pool: UnifiedPool) => void;
}) {
  if (!pool) return null;

  const poolType = pool.poolType || 'V2';
  const modeColor = poolType === 'STABLE' ? 'bg-blue-500/20 text-blue-400' : poolType === 'CL' ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-500/20 text-gray-400';
  const warnings = pool.warnings || [];
  const healthScore = pool.healthScore ?? 0;
  const volatility = pool.volatilityAnn ?? 0;

  const formatTime = (dateStr: string | undefined) => {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '—';
    }
  };

  return (
    <tr
      className="border-b border-dark-700 hover:bg-dark-700/40 transition-colors cursor-pointer"
      onClick={() => onClick(pool)}
    >
      {/* Pool name */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); onToggleFav(pool); }}
            className="flex-shrink-0 text-dark-500 hover:text-yellow-400 transition-colors"
          >
            {isFav ? <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" /> : <StarOff className="w-3.5 h-3.5" />}
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium text-sm">
              <span>{pool.baseToken || '?'}/{pool.quoteToken || '?'}</span>
              {pool.bluechip && <span className="text-xs text-blue-400">★</span>}
              {warnings.length > 0 && <AlertTriangle className="w-3 h-3 text-yellow-500" />}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={clsx('text-[10px] px-1.5 py-0 rounded', modeColor)}>{poolType}</span>
              <span className="text-[10px] text-dark-500">{pool.protocol || ''}</span>
            </div>
          </div>
        </div>
      </td>

      {/* Chain */}
      <td className="px-3 py-2.5 text-xs text-dark-400 capitalize">{pool.chain || '—'}</td>

      {/* TVL */}
      <td className="px-3 py-2.5 text-sm font-mono text-right">{fmt(pool.tvlUSD)}</td>

      {/* APR Total */}
      <td className="px-3 py-2.5 text-sm text-right">
        <span className={clsx('font-mono', (pool.aprTotal ?? 0) > 50 ? 'text-green-400' : '')}>
          {fmtPct(pool.aprTotal)}
        </span>
      </td>

      {/* APR Adjusted */}
      <td className="px-3 py-2.5 text-sm text-right">
        <span className="font-mono text-yellow-400">{fmtPct(pool.aprAdjusted)}</span>
      </td>

      {/* Volume 1h */}
      <td className="px-3 py-2.5 text-sm font-mono text-right text-dark-300">{fmt(pool.volume1hUSD)}</td>

      {/* Fees 1h */}
      <td className="px-3 py-2.5 text-sm font-mono text-right text-dark-300">{fmt(pool.fees1hUSD)}</td>

      {/* Volatility */}
      <td className="px-3 py-2.5 text-sm font-mono text-right text-dark-400">
        {fmtPct(volatility * 100, 0)}
      </td>

      {/* Health Score */}
      <td className="px-3 py-2.5">
        <div className="flex justify-end">
          <span className={clsx('px-2 py-0.5 rounded text-xs font-bold', healthBg(healthScore))}>
            {healthScore}
          </span>
        </div>
      </td>

      {/* Updated */}
      <td className="px-3 py-2.5 text-[10px] text-dark-500 text-right whitespace-nowrap">
        {formatTime(pool.updatedAt)}
      </td>
    </tr>
  );
}

// ============================================================
// TOP 3 RECOMMENDATION CARDS
// ============================================================

function Top3Cards({ pools, onClick }: { pools: UnifiedPool[]; onClick: (p: UnifiedPool) => void }) {
  if (!pools || !Array.isArray(pools)) return null;
  const top3 = pools.slice(0, 3).filter(p => p != null);
  if (!top3.length) return null;

  const modeInfo = (pool: UnifiedPool) => {
    const score = pool.healthScore ?? 0;
    if (score >= 75) return { label: 'Agressivo', icon: <Zap className="w-4 h-4 text-orange-400" />, color: 'border-orange-500/30 bg-orange-500/5' };
    if (score >= 55) return { label: 'Normal', icon: <BarChart2 className="w-4 h-4 text-blue-400" />, color: 'border-blue-500/30 bg-blue-500/5' };
    return { label: 'Defensivo', icon: <Shield className="w-4 h-4 text-green-400" />, color: 'border-green-500/30 bg-green-500/5' };
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
      {top3.map((pool, i) => {
        if (!pool) return null;
        const info = modeInfo(pool);
        const healthScore = pool.healthScore ?? 0;
        return (
          <div
            key={pool.id || i}
            className={clsx('rounded-xl border p-4 cursor-pointer hover:brightness-110 transition-all', info.color)}
            onClick={() => onClick(pool)}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-dark-400">#{i + 1} {info.label}</span>
              {info.icon}
            </div>
            <div className="font-bold text-base">{pool.baseToken || '?'}/{pool.quoteToken || '?'}</div>
            <div className="text-xs text-dark-400 mt-0.5">{pool.protocol || ''} · {pool.chain || ''}</div>
            <div className="flex gap-4 mt-3">
              <div>
                <div className="text-[10px] text-dark-500">TVL</div>
                <div className="text-sm font-mono">{fmt(pool.tvlUSD)}</div>
              </div>
              <div>
                <div className="text-[10px] text-dark-500">APR Ajust.</div>
                <div className="text-sm font-mono text-yellow-400">{fmtPct(pool.aprAdjusted)}</div>
              </div>
              <div>
                <div className="text-[10px] text-dark-500">Health</div>
                <div className={clsx('text-sm font-bold', healthColor(healthScore))}>{healthScore}</div>
              </div>
            </div>
            <div className="mt-2 text-xs text-dark-400 line-clamp-2">
              {healthScore >= 75
                ? `Alta liquidez e eficiência de capital. APR de fee ${fmtPct(pool.aprFee)}.`
                : healthScore >= 55
                ? `Boa relação risco/retorno. ${pool.bluechip ? 'Tokens blue-chip.' : 'Liquidez adequada.'}`
                : `Posicionamento conservador recomendado. Monitorar volume.`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function PoolsPage() {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>('healthScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [chainFilter, setChainFilter] = useState('');
  const [poolTypeFilter, setPoolTypeFilter] = useState('');
  const [bluechipOnly, setBluechipOnly] = useState(false);
  const [minTVL, setMinTVL] = useState('');
  const [minHealth, setMinHealth] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['unified-pools', chainFilter, bluechipOnly, poolTypeFilter, minTVL, minHealth],
    queryFn: () => fetchUnifiedPools({
      chain: chainFilter || undefined,
      bluechip: bluechipOnly || undefined,
      poolType: poolTypeFilter || undefined,
      minTVL: minTVL ? parseFloat(minTVL) : undefined,
      minHealth: minHealth ? parseFloat(minHealth) : undefined,
      limit: 200,
    }),
    staleTime: 60000,
    // Auto-retry every 3s when no data, otherwise every 2 min
    refetchInterval: (query) => {
      const pools = query.state.data?.pools;
      const syncing = query.state.data?.syncing;
      // If syncing or no pools, retry quickly
      if (syncing || !pools || pools.length === 0) return 3000;
      return 120000;
    },
  });

  const { data: favorites = [] } = useQuery({ queryKey: ['favorites'], queryFn: fetchFavorites });
  const { data: tokens = [] } = useQuery({ queryKey: ['tokens'], queryFn: fetchTokens, staleTime: 300000 });

  const favSet = useMemo(() => {
    if (!favorites || !Array.isArray(favorites)) return new Set<string>();
    return new Set(favorites.filter(f => f?.poolId).map(f => f.poolId));
  }, [favorites]);

  const handleToggleFav = useCallback(async (pool: UnifiedPool) => {
    if (!pool?.id) return;
    try {
      if (favSet.has(pool.id)) {
        await removeFavorite(pool.id);
      } else {
        await addFavorite({
          poolId: pool.id,
          chain: pool.chain || '',
          poolAddress: pool.poolAddress || '',
          token0Symbol: pool.baseToken || '',
          token1Symbol: pool.quoteToken || '',
          protocol: pool.protocol || ''
        });
      }
    } catch (e) {
      console.error('Toggle favorite error:', e);
    }
  }, [favSet]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const pools = data?.pools ?? [];

  // Client-side token search (supplement server filter) - with defensive checks
  const filtered = useMemo(() => {
    if (!pools || !Array.isArray(pools)) return [];
    try {
      let result = pools.filter(p => p != null);
      if (search.trim()) {
        const q = search.trim().toUpperCase();
        const qLower = search.trim().toLowerCase();
        result = result.filter(p => {
          const base = (p.baseToken || '').toUpperCase();
          const quote = (p.quoteToken || '').toUpperCase();
          const protocol = (p.protocol || '').toUpperCase();
          const addr = (p.poolAddress || '').toLowerCase();
          return base.includes(q) || quote.includes(q) || protocol.includes(q) || addr.includes(qLower);
        });
      }
      return result;
    } catch (e) {
      console.error('Filter error:', e);
      return [];
    }
  }, [pools, search]);

  // Client-side sort (backend also sorts, but client refines) - with defensive checks
  const sorted = useMemo(() => {
    if (!filtered || !Array.isArray(filtered)) return [];
    try {
      const keyMap: Record<SortKey, (p: UnifiedPool) => number> = {
        tvl: p => p.tvlUSD ?? 0,
        apr: p => p.aprTotal ?? 0,
        aprFee: p => p.aprFee ?? 0,
        aprAdjusted: p => p.aprAdjusted ?? 0,
        volume1h: p => p.volume1hUSD ?? 0,
        volume5m: p => p.volume5mUSD ?? 0,
        fees1h: p => p.fees1hUSD ?? 0,
        healthScore: p => p.healthScore ?? 0,
        volatilityAnn: p => p.volatilityAnn ?? 0,
        ratio: p => p.ratio ?? 0,
      };
      const getter = keyMap[sortKey];
      return [...filtered].sort((a, b) => {
        const va = getter(a);
        const vb = getter(b);
        return sortDir === 'desc' ? vb - va : va - vb;
      });
    } catch (e) {
      console.error('Sort error:', e);
      return filtered;
    }
  }, [filtered, sortKey, sortDir]);

  const handlePoolClick = (pool: UnifiedPool) => {
    // Defensive: use id as fallback if poolAddress is missing
    const address = pool.poolAddress || pool.id || 'unknown';
    if (address === 'unknown') {
      console.warn('Pool has no valid address:', pool);
      return;
    }
    navigate(`/pools/${pool.chain}/${address}`);
  };

  const CHAINS = ['', 'ethereum', 'arbitrum', 'base', 'polygon', 'optimism'];
  const POOL_TYPES = ['', 'CL', 'V2', 'STABLE'];

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            🏊 Pool Intelligence
          </h1>
          <p className="text-dark-400 text-sm mt-1">
            {data?.total ?? 0} pools analisadas · score institucional · dados reais
            {data?.syncing && <span className="ml-2 text-blue-400 text-xs">Sincronizando TheGraph...</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} disabled={isFetching} className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors disabled:opacity-50">
            <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors', showFilters ? 'bg-primary-600 text-white' : 'bg-dark-700 hover:bg-dark-600')}
          >
            <Filter className="w-4 h-4" />
            Filtros
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por token (ETH, USDC...) ou endereço..."
          list="token-suggestions"
          className="w-full bg-dark-800 border border-dark-600 rounded-lg pl-9 pr-4 py-2 text-sm focus:border-primary-500 focus:outline-none"
        />
        <datalist id="token-suggestions">
          {tokens.map(t => <option key={t} value={t} />)}
        </datalist>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-dark-800 rounded-xl border border-dark-600 p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-dark-400 mb-1">Chain</label>
            <select
              value={chainFilter}
              onChange={e => setChainFilter(e.target.value)}
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary-500"
            >
              {CHAINS.map(c => <option key={c} value={c}>{c || 'Todas'}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-dark-400 mb-1">Tipo</label>
            <select
              value={poolTypeFilter}
              onChange={e => setPoolTypeFilter(e.target.value)}
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary-500"
            >
              {POOL_TYPES.map(t => <option key={t} value={t}>{t || 'Todos'}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs text-dark-400 mb-1">TVL mín. (USD)</label>
            <input
              type="number"
              value={minTVL}
              onChange={e => setMinTVL(e.target.value)}
              placeholder="100000"
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary-500"
            />
          </div>

          <div>
            <label className="block text-xs text-dark-400 mb-1">Health mín.</label>
            <input
              type="number"
              min={0} max={100}
              value={minHealth}
              onChange={e => setMinHealth(e.target.value)}
              placeholder="0"
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-primary-500"
            />
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={bluechipOnly}
                onChange={e => setBluechipOnly(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm">Só Blue-chip ★</span>
            </label>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => { setChainFilter(''); setPoolTypeFilter(''); setMinTVL(''); setMinHealth(''); setBluechipOnly(false); setSearch(''); }}
              className="px-3 py-1.5 bg-dark-700 hover:bg-dark-600 rounded-lg text-sm transition-colors"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {/* Top 3 recommendations */}
      {!isLoading && sorted.length > 0 && (
        <Top3Cards pools={sorted} onClick={handlePoolClick} />
      )}

      {/* Table */}
      <div className="bg-dark-800 rounded-xl border border-dark-600 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-dark-900 border-b border-dark-700">
              <tr>
                <th className="px-3 py-2 text-xs font-medium text-dark-400">Pool</th>
                <th className="px-3 py-2 text-xs font-medium text-dark-400">Chain</th>
                <SortHeader label="TVL" sortKey="tvl" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="APR" sortKey="apr" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="APR Ajust." sortKey="aprAdjusted" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Vol. 1h" sortKey="volume1h" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Fees 1h" sortKey="fees1h" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Volat." sortKey="volatilityAnn" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Health" sortKey="healthScore" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th className="px-3 py-2 text-xs font-medium text-dark-400 text-right">Upd.</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-dark-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Carregando pools...
                  </td>
                </tr>
              ) : sorted.length === 0 && (data?.syncing || isFetching) ? (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-dark-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
                    <p className="font-medium">Sincronizando dados do TheGraph...</p>
                    <p className="text-xs mt-1">Isso pode levar alguns segundos na primeira vez.</p>
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-dark-400">
                    Nenhuma pool encontrada. Ajuste os filtros ou aguarde a sincronização.
                  </td>
                </tr>
              ) : (
                sorted.map(pool => (
                  <PoolRow
                    key={pool.id}
                    pool={pool}
                    isFav={favSet.has(pool.id)}
                    onToggleFav={handleToggleFav}
                    onClick={handlePoolClick}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {!isLoading && sorted.length > 0 && (
          <div className="px-4 py-2.5 border-t border-dark-700 text-xs text-dark-500 flex items-center justify-between">
            <span>{sorted.length} pools exibidas de {data?.total ?? 0} totais</span>
            <span className="flex items-center gap-1">
              <ExternalLink className="w-3 h-3" />
              Clique em qualquer pool para ver detalhes e range calculator
            </span>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-dark-400">
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-500/30 flex-shrink-0" />Health ≥70 = excelente</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-yellow-500/30 flex-shrink-0" />Health 45-69 = razoável</div>
        <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-500/30 flex-shrink-0" />Health &lt;45 = cuidado</div>
        <div className="flex items-center gap-1.5"><span className="text-yellow-400">★</span> Blue-chip: ambos os tokens são top</div>
      </div>
    </div>
  );
}
