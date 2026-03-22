import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Wifi, WifiOff, Sun, Moon } from 'lucide-react';
import { format } from 'date-fns';
import { useTheme } from 'next-themes';
import { fetchHealth } from '../../api/client';
import { MobileMenuButton } from './Sidebar';
import { NotificationBell } from '@/components/common/NotificationBell';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

export default function Header() {
  const { theme, setTheme } = useTheme();
  const { data: health, isLoading, refetch } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 30000,
  });
  const { addNotification } = useNotifications();
  const prevStatusRef = useRef<string | undefined>();

  // Auto-generate notifications on status change
  useEffect(() => {
    if (!health?.status) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = health.status;
    if (!prev) return; // skip first render

    if (prev === 'HEALTHY' && health.status === 'DEGRADED') {
      addNotification({ type: 'warning', title: 'Sistema degradado', message: 'O servidor esta operando em modo degradado. Alguns dados podem estar atrasados.' });
    } else if (prev !== 'HEALTHY' && health.status === 'HEALTHY') {
      addNotification({ type: 'success', title: 'Sistema restaurado', message: 'O servidor voltou ao estado normal.' });
    } else if (health.status === 'UNHEALTHY') {
      addNotification({ type: 'error', title: 'Sistema indisponivel', message: 'O servidor esta com problemas. Tente novamente em alguns minutos.' });
    }
  }, [health?.status, addNotification]);

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
          className="p-2 rounded-lg bg-secondary/60 hover:bg-secondary transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
          disabled={isLoading}
          title="Atualizar dados"
          aria-label="Atualizar dados"
        >
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
        </button>

        {/* Dark/Light theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-lg bg-secondary/60 hover:bg-secondary transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
          title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Notification bell */}
        <NotificationBell />

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

        {/* Chain selector — filtro global por chain disponível em /scout-settings */}
      </div>
    </header>
  );
}
