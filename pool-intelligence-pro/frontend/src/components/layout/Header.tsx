import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { format } from 'date-fns';
import { fetchHealth } from '../../api/client';
import { MobileMenuButton } from './Sidebar';
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
    <header className="h-14 lg:h-16 bg-dark-800 border-b border-dark-600 px-4 lg:px-6 flex items-center justify-between gap-4">
      {/* Mobile menu button + title */}
      <div className="flex items-center gap-3">
        <MobileMenuButton />
        <h2 className="text-base lg:text-lg font-semibold truncate">Pool Intelligence</h2>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2 lg:gap-4">
        {/* Timestamp - hidden on small screens */}
        <div className="hidden md:block text-sm text-dark-400">
          {health?.timestamp ? format(new Date(health.timestamp), 'HH:mm:ss') : '--:--:--'}
        </div>

        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors"
          disabled={isLoading}
        >
          <RefreshCw className={clsx('w-4 h-4', isLoading && 'animate-spin')} />
        </button>

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-1.5 rounded-full bg-dark-700">
          {isHealthy ? (
            <>
              <div className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
              <Wifi className="w-4 h-4 text-success-500" />
              <span className="hidden sm:inline text-sm text-success-400">Online</span>
            </>
          ) : isDegraded ? (
            <>
              <div className="w-2 h-2 rounded-full bg-warning-500 animate-pulse" />
              <Wifi className="w-4 h-4 text-warning-500" />
              <span className="hidden sm:inline text-sm text-warning-400">Degradado</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-danger-500" />
              <WifiOff className="w-4 h-4 text-danger-500" />
              <span className="hidden sm:inline text-sm text-danger-400">Offline</span>
            </>
          )}
        </div>

        {/* Chain selector - hidden on very small screens */}
        <select className="hidden sm:block bg-dark-700 border border-dark-500 rounded-lg px-2 lg:px-3 py-1.5 text-sm">
          <option value="ethereum">ETH</option>
          <option value="arbitrum">ARB</option>
          <option value="base">Base</option>
          <option value="polygon">Poly</option>
        </select>
      </div>
    </header>
  );
}
