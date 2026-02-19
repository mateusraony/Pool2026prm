import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, Trash2, Bell, ArrowRight, Star, AlertTriangle, TrendingUp } from 'lucide-react';
import { fetchWatchlist, removeFromWatchlist, fetchPools } from '../api/client';
import clsx from 'clsx';

function formatNum(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
  return num.toFixed(2);
}

export default function WatchlistPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: watchlist, isLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: fetchWatchlist,
  });

  // Fetch pool data to show details
  const { data: pools } = useQuery({
    queryKey: ['pools'],
    queryFn: () => fetchPools(),
  });

  const removeMutation = useMutation({
    mutationFn: removeFromWatchlist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  // Map watchlist items to pool data
  const watchlistWithDetails = watchlist?.map(item => {
    const poolData = pools?.find(p => p.pool.externalId === item.poolId);
    return { ...item, poolData };
  }) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star className="w-7 h-7 text-warning-400 fill-warning-400" />
            Watchlist
          </h1>
          <p className="text-dark-400 mt-1">Pools que voce esta monitorando</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-primary">{watchlist?.length || 0} pools</span>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse"><div className="p-4 h-24 bg-dark-700 rounded" /></div>
          ))}
        </div>
      ) : watchlistWithDetails.length > 0 ? (
        <div className="space-y-3">
          {watchlistWithDetails.map((item, index) => {
            const pool = item.poolData?.pool;
            const score = item.poolData?.score;
            const poolName = pool
              ? pool.token0.symbol + '/' + pool.token1.symbol
              : item.poolId.slice(0, 12) + '...';

            return (
              <motion.div
                key={item.poolId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="card hover:border-primary-500/50 transition-all cursor-pointer"
                onClick={() => pool && navigate('/simulation/' + pool.chain + '/' + (pool.poolAddress || pool.externalId || 'unknown'))}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {pool ? (
                        <div className="flex -space-x-2">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-xs font-bold border-2 border-dark-800">
                            {pool.token0.symbol.slice(0, 3)}
                          </div>
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-success-500 to-success-700 flex items-center justify-center text-xs font-bold border-2 border-dark-800">
                            {pool.token1.symbol.slice(0, 3)}
                          </div>
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center">
                          <Eye className="w-5 h-5 text-primary-400" />
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-lg">{poolName}</h3>
                        <p className="text-sm text-dark-400">
                          {pool ? pool.protocol + ' - ' + pool.chain : item.chain}
                        </p>
                      </div>
                    </div>

                    {pool && score && (
                      <div className="hidden md:flex items-center gap-6">
                        <div className="text-center">
                          <div className="text-xs text-dark-400">TVL</div>
                          <div className="font-semibold">${formatNum(pool.tvl)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-dark-400">Volume 24h</div>
                          <div className="font-semibold">${formatNum(pool.volume24h)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-dark-400">APR Est.</div>
                          <div className="font-semibold text-success-400">
                            {score.breakdown.return.aprEstimate.toFixed(1)}%
                          </div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-dark-400">Score</div>
                          <div className={clsx(
                            'font-bold',
                            score.total >= 70 ? 'text-success-400' :
                              score.total >= 50 ? 'text-warning-400' : 'text-danger-400'
                          )}>
                            {score.total.toFixed(0)}/100
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        className="btn btn-secondary p-2"
                        onClick={(e) => { e.stopPropagation(); navigate('/alerts'); }}
                        title="Criar alerta"
                      >
                        <Bell className="w-4 h-4" />
                      </button>
                      <button
                        className="btn btn-primary p-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (pool) navigate('/simulation/' + pool.chain + '/' + pool.poolAddress);
                        }}
                        title="Simular"
                      >
                        <TrendingUp className="w-4 h-4" />
                      </button>
                      <button
                        className="btn bg-danger-600 hover:bg-danger-500 p-2"
                        onClick={(e) => { e.stopPropagation(); removeMutation.mutate(item.poolId); }}
                        disabled={removeMutation.isPending}
                        title="Remover da watchlist"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Mobile stats */}
                  {pool && score && (
                    <div className="md:hidden mt-4 grid grid-cols-4 gap-2 text-center text-sm">
                      <div className="bg-dark-700/50 rounded p-2">
                        <div className="text-xs text-dark-400">TVL</div>
                        <div className="font-semibold">${formatNum(pool.tvl)}</div>
                      </div>
                      <div className="bg-dark-700/50 rounded p-2">
                        <div className="text-xs text-dark-400">Vol</div>
                        <div className="font-semibold">${formatNum(pool.volume24h)}</div>
                      </div>
                      <div className="bg-dark-700/50 rounded p-2">
                        <div className="text-xs text-dark-400">APR</div>
                        <div className="font-semibold text-success-400">{score.breakdown.return.aprEstimate.toFixed(1)}%</div>
                      </div>
                      <div className="bg-dark-700/50 rounded p-2">
                        <div className="text-xs text-dark-400">Score</div>
                        <div className="font-semibold">{score.total.toFixed(0)}</div>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <Star className="w-16 h-16 mx-auto mb-4 text-dark-600" />
          <h3 className="text-lg font-semibold mb-2">Watchlist vazia</h3>
          <p className="text-dark-400 mb-4">Adicione pools do Radar para monitorar</p>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/radar')}
          >
            <ArrowRight className="w-4 h-4 mr-2" />
            Ir para o Radar
          </button>
        </div>
      )}
    </div>
  );
}
