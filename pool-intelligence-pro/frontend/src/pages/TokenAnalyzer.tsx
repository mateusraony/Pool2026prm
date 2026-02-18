import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  Droplets, BarChart2, Shield, Zap, ChevronRight, RefreshCw, Star,
} from 'lucide-react';
import clsx from 'clsx';
import { fetchUnifiedPools, fetchTokens, UnifiedPool } from '../api/client';

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
  if (score >= 70) return 'bg-green-500/20 border-green-500/30';
  if (score >= 45) return 'bg-yellow-500/20 border-yellow-500/30';
  return 'bg-red-500/20 border-red-500/30';
}

// ============================================================
// STAT CARD
// ============================================================

function StatCard({ label, value, subValue, icon, color }: {
  label: string; value: string; subValue?: string;
  icon: React.ReactNode; color: string;
}) {
  return (
    <div className={clsx('rounded-xl border p-4', color)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-dark-400 uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {subValue && <div className="text-xs text-dark-400 mt-1">{subValue}</div>}
    </div>
  );
}

// ============================================================
// POOL CARD (for results)
// ============================================================

function PoolCard({ pool, rank, onClick }: { pool: UnifiedPool; rank: number; onClick: () => void }) {
  const modeColor = pool.poolType === 'STABLE' ? 'bg-blue-500/20 text-blue-400' :
    pool.poolType === 'CL' ? 'bg-purple-500/20 text-purple-400' : 'bg-gray-500/20 text-gray-400';

  return (
    <div
      className="bg-dark-800 border border-dark-600 rounded-xl p-4 hover:border-primary-500/50 cursor-pointer transition-all"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-dark-700 flex items-center justify-center text-xs font-bold">
            {rank}
          </span>
          <div>
            <div className="font-bold">{pool.baseToken}/{pool.quoteToken}</div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className={clsx('text-[10px] px-1.5 rounded', modeColor)}>{pool.poolType}</span>
              <span className="text-[10px] text-dark-500">{pool.protocol} · {pool.chain}</span>
            </div>
          </div>
        </div>
        <div className={clsx('px-2 py-1 rounded-lg text-sm font-bold', healthBg(pool.healthScore))}>
          {pool.healthScore}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 text-center">
        <div>
          <div className="text-[10px] text-dark-500 mb-0.5">TVL</div>
          <div className="text-sm font-mono">{fmt(pool.tvlUSD)}</div>
        </div>
        <div>
          <div className="text-[10px] text-dark-500 mb-0.5">APR Fee</div>
          <div className="text-sm font-mono text-green-400">{fmtPct(pool.aprFee)}</div>
        </div>
        <div>
          <div className="text-[10px] text-dark-500 mb-0.5">APR Ajust.</div>
          <div className="text-sm font-mono text-yellow-400">{fmtPct(pool.aprAdjusted)}</div>
        </div>
        <div>
          <div className="text-[10px] text-dark-500 mb-0.5">Vol 1h</div>
          <div className="text-sm font-mono">{fmt(pool.volume1hUSD)}</div>
        </div>
      </div>

      {pool.warnings.length > 0 && (
        <div className="mt-3 flex items-center gap-1 text-xs text-yellow-400">
          <AlertTriangle className="w-3 h-3" />
          {pool.warnings[0]}
        </div>
      )}

      <div className="mt-3 flex items-center justify-end text-xs text-primary-400 hover:text-primary-300">
        Ver detalhes <ChevronRight className="w-3 h-3 ml-1" />
      </div>
    </div>
  );
}

// ============================================================
// VERDICT PANEL
// ============================================================

function VerdictPanel({ pools, token }: { pools: UnifiedPool[]; token: string }) {
  if (pools.length === 0) return null;

  const totalTVL = pools.reduce((sum, p) => sum + p.tvlUSD, 0);
  const avgHealth = pools.reduce((sum, p) => sum + p.healthScore, 0) / pools.length;
  const best = pools[0];
  const bluechipPools = pools.filter(p => p.bluechip);
  const clPools = pools.filter(p => p.poolType === 'CL');

  let verdict: 'good' | 'moderate' | 'risky' = 'good';
  let verdictText = '';
  let verdictIcon = <CheckCircle className="w-5 h-5 text-green-400" />;

  if (totalTVL < 100000) {
    verdict = 'risky';
    verdictText = `⚠️ Liquidez muito baixa (${fmt(totalTVL)}). Risco alto de slippage e dificuldade para sair de posições.`;
    verdictIcon = <AlertTriangle className="w-5 h-5 text-red-400" />;
  } else if (totalTVL < 1000000) {
    verdict = 'moderate';
    verdictText = `Liquidez moderada (${fmt(totalTVL)}). Pools existem mas volume pode ser inconsistente.`;
    verdictIcon = <TrendingDown className="w-5 h-5 text-yellow-400" />;
  } else if (avgHealth >= 60 && bluechipPools.length > 0) {
    verdictText = `✅ Excelente liquidez com ${pools.length} pools. Média de health score ${avgHealth.toFixed(0)}.`;
    verdictIcon = <CheckCircle className="w-5 h-5 text-green-400" />;
  } else if (avgHealth >= 45) {
    verdict = 'moderate';
    verdictText = `Boa liquidez (${fmt(totalTVL)}), mas health score médio (${avgHealth.toFixed(0)}) indica pools menos estáveis.`;
    verdictIcon = <TrendingDown className="w-5 h-5 text-yellow-400" />;
  } else {
    verdict = 'risky';
    verdictText = `Pools existem mas health score baixo (${avgHealth.toFixed(0)}). Monitorar antes de entrar.`;
    verdictIcon = <AlertTriangle className="w-5 h-5 text-red-400" />;
  }

  const bgColor = verdict === 'good' ? 'bg-green-500/10 border-green-500/30' :
    verdict === 'moderate' ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-red-500/10 border-red-500/30';

  return (
    <div className={clsx('rounded-xl border p-5', bgColor)}>
      <div className="flex items-start gap-3">
        {verdictIcon}
        <div className="flex-1">
          <h3 className="font-bold text-lg mb-1">Veredicto para {token.toUpperCase()}</h3>
          <p className="text-sm text-dark-300">{verdictText}</p>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-dark-500 text-xs">Pools</span>
              <div className="font-bold">{pools.length}</div>
            </div>
            <div>
              <span className="text-dark-500 text-xs">TVL Total</span>
              <div className="font-bold">{fmt(totalTVL)}</div>
            </div>
            <div>
              <span className="text-dark-500 text-xs">Pools Blue-chip</span>
              <div className="font-bold">{bluechipPools.length}</div>
            </div>
            <div>
              <span className="text-dark-500 text-xs">Pools CL</span>
              <div className="font-bold">{clPools.length}</div>
            </div>
          </div>

          {best && (
            <div className="mt-4 pt-4 border-t border-dark-600">
              <div className="text-xs text-dark-400 mb-2">🏆 Melhor pool recomendada:</div>
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold">{best.baseToken}/{best.quoteToken}</span>
                  <span className="text-dark-400 text-sm ml-2">{best.protocol} · {best.chain}</span>
                </div>
                <div className="flex gap-3">
                  <span className="text-green-400">{fmtPct(best.aprAdjusted)} APR</span>
                  <span className={healthColor(best.healthScore)}>Health {best.healthScore}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default function TokenAnalyzerPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialToken = searchParams.get('token') || '';

  const [tokenInput, setTokenInput] = useState(initialToken);
  const [searchedToken, setSearchedToken] = useState(initialToken);

  const { data: tokens = [] } = useQuery({
    queryKey: ['tokens'],
    queryFn: fetchTokens,
    staleTime: 300000,
  });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['token-pools', searchedToken],
    queryFn: () => fetchUnifiedPools({ token: searchedToken, limit: 100 }),
    enabled: !!searchedToken,
    staleTime: 60000,
  });

  const handleSearch = () => {
    if (tokenInput.trim()) {
      const normalized = tokenInput.trim().toUpperCase();
      setSearchedToken(normalized);
      setSearchParams({ token: normalized });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  // Filter pools that contain the searched token
  const filteredPools = useMemo(() => {
    if (!data?.pools || !searchedToken) return [];
    const q = searchedToken.toUpperCase();
    return data.pools
      .filter(p =>
        p.baseToken.toUpperCase() === q ||
        p.quoteToken.toUpperCase() === q ||
        p.baseToken.toUpperCase().includes(q) ||
        p.quoteToken.toUpperCase().includes(q) ||
        p.poolAddress.toLowerCase().includes(searchedToken.toLowerCase())
      )
      .sort((a, b) => b.healthScore - a.healthScore);
  }, [data?.pools, searchedToken]);

  // Stats
  const stats = useMemo(() => {
    if (!filteredPools.length) return null;
    const totalTVL = filteredPools.reduce((s, p) => s + p.tvlUSD, 0);
    const avgHealth = filteredPools.reduce((s, p) => s + p.healthScore, 0) / filteredPools.length;
    const maxAPR = Math.max(...filteredPools.map(p => p.aprAdjusted ?? 0));
    const totalVol24h = filteredPools.reduce((s, p) => s + p.volume24hUSD, 0);
    return { totalTVL, avgHealth, maxAPR, totalVol24h };
  }, [filteredPools]);

  const quickTokens = ['ETH', 'USDC', 'WBTC', 'ARB', 'OP', 'MATIC', 'USDT', 'DAI'];

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold flex items-center justify-center gap-3">
          <Search className="w-8 h-8 text-primary-400" />
          Token Analyzer
        </h1>
        <p className="text-dark-400 mt-2">
          Pesquise qualquer token e veja se vale a pena investir em pools de liquidez
        </p>
      </div>

      {/* Search Box */}
      <div className="bg-dark-800 border border-dark-600 rounded-xl p-6">
        <label className="block text-sm font-medium mb-2">
          Digite o símbolo ou endereço do token
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ex: ETH, USDC, ARB, 0x..."
              list="token-list"
              className="w-full bg-dark-700 border border-dark-600 rounded-lg px-4 py-3 text-lg focus:border-primary-500 focus:outline-none"
            />
            <datalist id="token-list">
              {tokens.map(t => <option key={t} value={t} />)}
            </datalist>
          </div>
          <button
            onClick={handleSearch}
            disabled={!tokenInput.trim() || isFetching}
            className="px-6 py-3 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            {isFetching ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
            Analisar
          </button>
        </div>

        {/* Quick tokens */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs text-dark-500">Populares:</span>
          {quickTokens.map(t => (
            <button
              key={t}
              onClick={() => { setTokenInput(t); setSearchedToken(t); setSearchParams({ token: t }); }}
              className="px-2 py-1 text-xs rounded bg-dark-700 hover:bg-dark-600 transition-colors"
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {isLoading && searchedToken && (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary-400 mb-3" />
          <p className="text-dark-400">Buscando pools para {searchedToken}...</p>
        </div>
      )}

      {/* Results */}
      {searchedToken && !isLoading && (
        <>
          {filteredPools.length === 0 ? (
            <div className="text-center py-12 bg-dark-800 border border-dark-600 rounded-xl">
              <AlertTriangle className="w-12 h-12 mx-auto text-yellow-400 mb-3" />
              <h3 className="text-xl font-bold mb-2">Nenhuma pool encontrada</h3>
              <p className="text-dark-400">
                Não encontramos pools de liquidez com o token "{searchedToken}".
                <br />
                Verifique o símbolo ou tente um endereço de contrato.
              </p>
            </div>
          ) : (
            <>
              {/* Verdict */}
              <VerdictPanel pools={filteredPools} token={searchedToken} />

              {/* Stats Grid */}
              {stats && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard
                    label="Liquidez Total"
                    value={fmt(stats.totalTVL)}
                    subValue={`Em ${filteredPools.length} pools`}
                    icon={<Droplets className="w-5 h-5 text-blue-400" />}
                    color="bg-blue-500/10 border-blue-500/30"
                  />
                  <StatCard
                    label="Health Médio"
                    value={stats.avgHealth.toFixed(0)}
                    subValue="Score institucional"
                    icon={<Shield className="w-5 h-5 text-green-400" />}
                    color={healthBg(stats.avgHealth)}
                  />
                  <StatCard
                    label="Maior APR"
                    value={fmtPct(stats.maxAPR)}
                    subValue="APR ajustado máximo"
                    icon={<TrendingUp className="w-5 h-5 text-yellow-400" />}
                    color="bg-yellow-500/10 border-yellow-500/30"
                  />
                  <StatCard
                    label="Volume 24h"
                    value={fmt(stats.totalVol24h)}
                    subValue="Soma de todas pools"
                    icon={<BarChart2 className="w-5 h-5 text-purple-400" />}
                    color="bg-purple-500/10 border-purple-500/30"
                  />
                </div>
              )}

              {/* Pool List */}
              <div>
                <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Star className="w-5 h-5 text-yellow-400" />
                  Pools com {searchedToken} (ordenadas por Health Score)
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {filteredPools.slice(0, 10).map((pool, i) => (
                    <PoolCard
                      key={pool.id}
                      pool={pool}
                      rank={i + 1}
                      onClick={() => navigate(`/pools/${pool.chain}/${pool.poolAddress}`)}
                    />
                  ))}
                </div>
                {filteredPools.length > 10 && (
                  <p className="text-center text-dark-400 text-sm mt-4">
                    Mostrando 10 de {filteredPools.length} pools. Vá para Pool Intelligence para ver todas.
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Initial state */}
      {!searchedToken && (
        <div className="text-center py-16 bg-dark-800/50 border border-dark-700 rounded-xl">
          <Zap className="w-16 h-16 mx-auto text-primary-400/50 mb-4" />
          <h3 className="text-xl font-medium mb-2">Pronto para analisar</h3>
          <p className="text-dark-400 max-w-md mx-auto">
            Digite o símbolo do token que você quer analisar (ex: ETH, ARB, PEPE)
            e veja se existem pools com boa liquidez e saúde.
          </p>
        </div>
      )}
    </div>
  );
}
