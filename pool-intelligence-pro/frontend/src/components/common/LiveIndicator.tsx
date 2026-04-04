/**
 * LiveIndicator — badge de status de conexão WebSocket
 * Mostra ponto verde pulsante quando conectado, cinza quando offline.
 */

import { useWebSocket } from '@/hooks/useWebSocket';
import { cn } from '@/lib/utils';

interface LiveIndicatorProps {
  className?: string;
  showLabel?: boolean;
}

export function LiveIndicator({ className, showLabel = true }: LiveIndicatorProps) {
  const { connected, lastUpdate, poolsUpdatedCount } = useWebSocket();

  return (
    <div className={cn('flex items-center gap-1.5', className)} title={
      connected
        ? (lastUpdate ? 'Atualizado: ' + lastUpdate.toLocaleTimeString('pt-BR') : 'Conectado')
        : 'Desconectado'
    }>
      <span className="relative flex h-2 w-2">
        {connected && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        )}
        <span className={cn(
          'relative inline-flex rounded-full h-2 w-2',
          connected ? 'bg-green-400' : 'bg-gray-500'
        )} />
      </span>
      {showLabel && (
        <span className={cn(
          'text-xs font-medium',
          connected ? 'text-green-400' : 'text-muted-foreground'
        )}>
          {connected ? 'Live' : 'Offline'}
          {poolsUpdatedCount > 0 && connected && (
            <span className="ml-1 text-muted-foreground font-normal">
              ×{poolsUpdatedCount}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
