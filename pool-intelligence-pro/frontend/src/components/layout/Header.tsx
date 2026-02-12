import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { format } from 'date-fns';
import { fetchHealth } from '../../api/client';
import clsx from 'clsx';

export default function Header() {
  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 30000,
  });

  const isHealthy = health?.status === 'HEALTHY';
  const isDegraded = health?.status === 'DEGRADED';

  return (
    <header className="h-16 bg-dark-800 border-b border-dark-600 px-6 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">Dashboard</h2>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-sm text-dark-400">
          Atualizado: {health?.timestamp ? format(new Date(health.timestamp), 'HH:mm:ss') : '--:--:--'}
        </div>

        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors"
          disabled={isLoading}
        >
          <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
        </button>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-dark-700">
          {isHealthy ? (
            <>
              <div className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
              <Wifi className="w-4 h-4 text-success-500" />
              <span className="text-sm text-success-400">Online</span>
            </>
          ) : isDegraded ? (
            <>
              <div className="w-2 h-2 rounded-full bg-warning-500 animate-pulse" />
              <Wifi className="w-4 h-4 text-warning-500" />
              <span className="text-sm text-warning-400">Degradado</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-danger-500" />
              <WifiOff className="w-4 h-4 text-danger-500" />
              <span className="text-sm text-danger-400">Offline</span>
            </>
          )}
        </div>

        <select className="bg-dark-700 border border-dark-500 rounded-lg px-3 py-1.5 text-sm">
          <option value="ethereum">Ethereum</option>
          <option value="arbitrum">Arbitrum</option>
          <option value="base">Base</option>
          <option value="polygon">Polygon</option>
        </select>
      </div>
    </header>
  );
}
