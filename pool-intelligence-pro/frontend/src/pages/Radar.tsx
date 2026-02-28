import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { TrendingUp, Eye, AlertTriangle, ArrowRight, Check, Loader2, Star } from 'lucide-react';
import { fetchPools, addToWatchlist, fetchWatchlist, Pool, Score } from '../api/client';
import clsx from 'clsx';

function formatNum(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
  return num.toFixed(2);
}

function ScoreBadge({ score }: { score: Score }) {
  const total = score?.total ?? 50;
  const color = total >= 70 ? 'success' : total >= 50 ? 'warning' : 'danger';
  return <span className={clsx('badge', 'badge-' + color)}>{total.toFixed(0)}/100</span>;
}

function ModeBadge({ mode }: { mode: string }) {
  const configs: Record<string, { emoji: string; label: string; color: string }> = {
    DEFENSIVE: { emoji: '🛡️', label: 'Defensivo', color: 'success' },
    NORMAL: { emoji: '⚖️', label: 'Normal', color: 'warning' },
    AGGRESSIVE: { emoji: '🎯', label: 'Agressivo', color: 'danger' },
  };
  const config = configs[mode] || { emoji: '❓', label: mode, color: 'primary' };
  return <span className={clsx('badge', 'badge-' + config.color)}>{config.emoji} {config.label}</span>;
}

function PoolCard({ pool, score, index, isWatched, isAdding, onAddToWatchlist }: {
  pool: Pool;
  score: Score;
  index: number;
  isWatched: boolean;
  isAdding: boolean;
  onAddToWatchlist: () => void;
}) {
  const navigate = useNavigate();
  const poolAddress = pool.poolAddress || 'unknown';
  const poolPath = '/simulation/' + pool.chain + '/' + poolAddress;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="card hover:border-primary-500/50 transition-all cursor-pointer group"
      onClick={() => navigate(poolPath)}
    >
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-xs font-bold border-2 border-dark-800">
                {(pool.token0?.symbol ?? '???').slice(0, 3)}
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-success-500 to-success-700 flex items-center justify-center text-xs font-bold border-2 border-dark-800">
                {(pool.token1?.symbol ?? '???').slice(0, 3)}
              </div>
            </div>
            <div>
              <h3 className="font-semibold">{pool.token0?.symbol ?? '?'}/{pool.token1?.symbol ?? '?'}</h3>
              <p className="text-xs text-dark-400">{pool.protocol} - {pool.chain}</p>
            </div>
          </div>
          <ScoreBadge score={score} />
        </div>

        {/* Token Prices - for verification */}
        <div className="flex gap-2 mb-3 text-xs">
          <span className="px-2 py-1 rounded bg-dark-700 font-mono">
            {pool.token0?.symbol}: {pool.token0?.priceUsd ? '$' + pool.token0.priceUsd.toFixed(2) : <span className="text-warning-400">sem preço</span>}
          </span>
          <span className="px-2 py-1 rounded bg-dark-700 font-mono">
            {pool.token1?.symbol}: {pool.token1?.priceUsd ? '$' + pool.token1.priceUsd.toFixed(2) : <span className="text-warning-400">sem preço</span>}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="stat-card">
            <div className="stat-label">TVL</div>
            <div className="stat-value">{'$' + formatNum(pool.tvl || 0)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Volume 24h</div>
            <div className="stat-value">{'$' + formatNum(pool.volume24h || 0)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">APR Est.</div>
            <div className="stat-value text-success-400">{(score?.breakdown?.return?.aprEstimate ?? pool.apr ?? 0).toFixed(1) + '%'}</div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <ModeBadge mode={score?.recommendedMode || 'NORMAL'} />
          {score?.isSuspect && (
            <div className="flex items-center gap-1 text-warning-400 text-xs">
              <AlertTriangle className="w-3 h-3" />
              Suspeito
            </div>
          )}
          <div className="flex gap-2">
            <button
              className={clsx(
                'p-2 rounded-lg transition-all',
                isWatched
                  ? 'bg-warning-500 text-white'
                  : isAdding
                    ? 'bg-dark-600 animate-pulse'
                    : 'bg-dark-600 hover:bg-warning-500 hover:text-white'
              )}
              onClick={(e) => { e.stopPropagation(); if (!isWatched && !isAdding) onAddToWatchlist(); }}
              title={isWatched ? 'Na watchlist' : 'Adicionar à watchlist'}
              disabled={isAdding}
            >
              {isAdding ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isWatched ? (
                <Star className="w-4 h-4 fill-current" />
              ) : (
                <Star className="w-4 h-4" />
              )}
            </button>
            <button
              className="p-2 rounded-lg bg-primary-600 hover:bg-primary-500 transition-colors"
              onClick={(e) => { e.stopPropagation(); navigate(poolPath); }}
              title="Simular"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function RadarPage() {
  const queryClient = useQueryClient();

  const { data: pools, isLoading, error } = useQuery({
    queryKey: ['pools'],
    queryFn: () => fetchPools(),
    refetchInterval: 60000,
  });

  const { data: watchlist } = useQuery({
    queryKey: ['watchlist'],
    queryFn: fetchWatchlist,
  });

  const watchedIds = new Set(watchlist?.map(w => w.poolId) || []);

  const addMutation = useMutation({
    mutationFn: ({ poolId, chain, address }: { poolId: string; chain: string; address: string }) =>
      addToWatchlist(poolId, chain, address),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
    onError: (error) => {
      console.error('Failed to add to watchlist:', error);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">📡 Radar de Pools</h1>
          <p className="text-dark-400 mt-1">Descoberta automatica de oportunidades em DeFi</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-dark-400">
          <TrendingUp className="w-4 h-4 text-success-500" />
          {(pools?.length || 0) + ' pools encontradas'}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map((i) => (
            <div key={i} className="card animate-pulse"><div className="p-5 space-y-4"><div className="h-10 bg-dark-700 rounded" /><div className="h-20 bg-dark-700 rounded" /><div className="h-8 bg-dark-700 rounded" /></div></div>
          ))}
        </div>
      ) : error ? (
        <div className="card p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-danger-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Erro ao carregar pools</h3>
          <p className="text-dark-400">Verifique a conexao com o servidor</p>
        </div>
      ) : pools && pools.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {pools.map((item, index) => (
            <PoolCard
              key={item.pool.poolAddress || item.pool.externalId}
              pool={item.pool}
              score={item.score}
              index={index}
              isWatched={watchedIds.has(item.pool.poolAddress || item.pool.externalId)}
              isAdding={addMutation.isPending && addMutation.variables?.poolId === (item.pool.poolAddress || item.pool.externalId)}
              onAddToWatchlist={() => addMutation.mutate({
                poolId: item.pool.poolAddress || item.pool.externalId,
                chain: item.pool.chain,
                address: item.pool.poolAddress,
              })}
            />
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-4">🔍</div>
          <h3 className="text-lg font-semibold mb-2">Aguardando scan</h3>
          <p className="text-dark-400">O radar esta buscando pools...</p>
        </div>
      )}
    </div>
  );
}
