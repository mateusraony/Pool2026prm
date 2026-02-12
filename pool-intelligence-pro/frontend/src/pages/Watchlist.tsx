import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Eye, Trash2, Bell, ExternalLink } from 'lucide-react';
import { fetchWatchlist, removeFromWatchlist } from '../api/client';

export default function WatchlistPage() {
  const queryClient = useQueryClient();
  
  const { data: watchlist, isLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: fetchWatchlist,
  });

  const removeMutation = useMutation({
    mutationFn: removeFromWatchlist,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">👀 Watchlist</h1>
          <p className="text-dark-400 mt-1">Pools que voce esta monitorando</p>
        </div>
        <div className="text-sm text-dark-400">
          {(watchlist?.length || 0) + ' pools monitoradas'}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map((i) => (
            <div key={i} className="card animate-pulse"><div className="p-4 h-20 bg-dark-700 rounded" /></div>
          ))}
        </div>
      ) : watchlist && watchlist.length > 0 ? (
        <div className="space-y-3">
          {watchlist.map((item, index) => (
            <motion.div
              key={item.poolId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="card"
            >
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center">
                    <Eye className="w-5 h-5 text-primary-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{item.poolId}</h3>
                    <p className="text-sm text-dark-400">{item.chain} - {item.address.slice(0, 10)}...</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn btn-secondary p-2">
                    <Bell className="w-4 h-4" />
                  </button>
                  <button className="btn btn-secondary p-2">
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button 
                    className="btn btn-danger p-2"
                    onClick={() => removeMutation.mutate(item.poolId)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-4">👀</div>
          <h3 className="text-lg font-semibold mb-2">Watchlist vazia</h3>
          <p className="text-dark-400">Adicione pools do Radar para monitorar</p>
        </div>
      )}
    </div>
  );
}
