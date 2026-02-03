import { useQuery } from '@tanstack/react-query';
import { Bell, RefreshCw } from 'lucide-react';
import { fetchAlerts } from '../../api/client';
import clsx from 'clsx';

export default function Header() {
  const { data: alertsData, refetch, isRefetching } = useQuery({
    queryKey: ['alerts', { acknowledged: false }],
    queryFn: () => fetchAlerts({ acknowledged: false }),
    refetchInterval: 60000, // 1 minuto
  });

  const unreadCount = alertsData?.unacknowledgedCount || 0;

  return (
    <header className="h-16 bg-dark-900 border-b border-dark-700 flex items-center justify-between px-6">
      {/* Status */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center text-sm">
          <span className="w-2 h-2 bg-success-500 rounded-full mr-2 animate-pulse" />
          <span className="text-dark-300">Sistema Online</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-4">
        {/* Refresh button */}
        <button
          onClick={() => refetch()}
          className={clsx(
            'p-2 rounded-lg text-dark-400 hover:text-dark-100 hover:bg-dark-800 transition-colors',
            isRefetching && 'animate-spin'
          )}
          title="Atualizar"
        >
          <RefreshCw className="w-5 h-5" />
        </button>

        {/* Notifications */}
        <button
          className="relative p-2 rounded-lg text-dark-400 hover:text-dark-100 hover:bg-dark-800 transition-colors"
          title="Alertas"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-danger-500 text-white text-xs rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
