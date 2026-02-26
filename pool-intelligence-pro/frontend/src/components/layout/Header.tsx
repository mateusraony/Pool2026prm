import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { format } from 'date-fns';
import { fetchHealth } from '../../api/client';
import { MobileMenuButton } from './Sidebar';
import { cn } from '@/lib/utils';

export default function Header() {
  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 30000,
  });

  const isHealthy = health?.status === 'HEALTHY';
  const isDegraded = health?.status === 'DEGRADED';

  return (
    <header className="sticky top-0 z-30 h-14 lg:h-16 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border px-4 lg:px-6 flex items-center justify-between gap-4">
      {/* Mobile menu button + title */}
      <div className="flex items-center gap-3">
        <MobileMenuButton />
        <h2 className="text-base lg:text-lg font-semibold truncate">Pool Intelligence</h2>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2 lg:gap-4">
        {/* Timestamp */}
        <div className="hidden md:block text-sm text-muted-foreground font-mono">
          {health?.timestamp ? format(new Date(health.timestamp), 'HH:mm:ss') : '--:--:--'}
        </div>

        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
          disabled={isLoading}
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
        </button>

        {/* Status indicator */}
        <div className="flex items-center gap-1.5 lg:gap-2 px-2 lg:px-3 py-1.5 rounded-full bg-secondary">
          {isHealthy ? (
            <>
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <Wifi className="w-4 h-4 text-success" />
              <span className="hidden sm:inline text-sm text-success">Online</span>
            </>
          ) : isDegraded ? (
            <>
              <div className="w-2 h-2 rounded-full bg-warning animate-pulse" />
              <Wifi className="w-4 h-4 text-warning" />
              <span className="hidden sm:inline text-sm text-warning">Degradado</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-destructive" />
              <WifiOff className="w-4 h-4 text-destructive" />
              <span className="hidden sm:inline text-sm text-destructive">Offline</span>
            </>
          )}
        </div>

        {/* Chain selector */}
        <select className="hidden sm:block bg-secondary border border-border rounded-lg px-2 lg:px-3 py-1.5 text-sm">
          <option value="ethereum">ETH</option>
          <option value="arbitrum">ARB</option>
          <option value="base">Base</option>
          <option value="polygon">Poly</option>
        </select>
      </div>
    </header>
  );
}
