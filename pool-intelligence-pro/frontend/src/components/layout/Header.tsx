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
    <header className="sticky top-0 z-30 h-14 lg:h-16 bg-background/80 backdrop-blur-xl border-b border-border/40 px-4 lg:px-6 flex items-center justify-between gap-4">
      {/* Mobile menu button + title */}
      <div className="flex items-center gap-3">
        <MobileMenuButton />
        <h2 className="text-base lg:text-lg font-semibold truncate font-display tracking-tight">
          Pool Intelligence
        </h2>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2 lg:gap-3">
        {/* Timestamp */}
        <div className="hidden md:flex items-center gap-1.5 text-sm text-muted-foreground font-mono bg-secondary/50 px-2.5 py-1 rounded-lg">
          {health?.timestamp ? format(new Date(health.timestamp), 'HH:mm:ss') : '--:--:--'}
        </div>

        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg bg-secondary/60 hover:bg-secondary transition-all duration-200 hover:scale-105 active:scale-95"
          disabled={isLoading}
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
        </button>

        {/* Status indicator — real-time monitoring pattern */}
        <div className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-full transition-all duration-300',
          isHealthy
            ? 'bg-success/10 ring-1 ring-success/20'
            : isDegraded
              ? 'bg-warning/10 ring-1 ring-warning/20'
              : 'bg-destructive/10 ring-1 ring-destructive/20'
        )}>
          {isHealthy ? (
            <>
              <div className="live-dot text-success" />
              <Wifi className="w-3.5 h-3.5 text-success" />
              <span className="hidden sm:inline text-xs font-medium text-success">Online</span>
            </>
          ) : isDegraded ? (
            <>
              <div className="live-dot text-warning" />
              <Wifi className="w-3.5 h-3.5 text-warning" />
              <span className="hidden sm:inline text-xs font-medium text-warning">Degradado</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-destructive" />
              <WifiOff className="w-3.5 h-3.5 text-destructive" />
              <span className="hidden sm:inline text-xs font-medium text-destructive">Offline</span>
            </>
          )}
        </div>

        {/* Chain selector */}
        <select className="hidden sm:block bg-secondary/60 border border-border/40 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-secondary transition-colors cursor-pointer">
          <option value="ethereum">ETH</option>
          <option value="arbitrum">ARB</option>
          <option value="base">Base</option>
          <option value="polygon">Poly</option>
        </select>
      </div>
    </header>
  );
}
