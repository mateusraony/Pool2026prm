import { useQuery } from '@tanstack/react-query';
import { Activity, Database, Server, Clock, AlertTriangle, CheckCircle, XCircle, HardDrive } from 'lucide-react';
import { fetchHealth, fetchLogs } from '../api/client';
import { format } from 'date-fns';
import clsx from 'clsx';

export default function StatusPage() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 10000,
  });

  const { data: logs } = useQuery({
    queryKey: ['logs'],
    queryFn: () => fetchLogs(20),
    refetchInterval: 30000,
  });

  const statusColor = health?.status === 'HEALTHY' ? 'success' : health?.status === 'DEGRADED' ? 'warning' : 'danger';
  const StatusIcon = health?.status === 'HEALTHY' ? CheckCircle : health?.status === 'DEGRADED' ? AlertTriangle : XCircle;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">🩺 Status do Sistema</h1>
        <p className="text-dark-400 mt-1">Monitoramento em tempo real</p>
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        <div className="card">
          <div className="card-body text-center">
            <StatusIcon className={clsx('w-12 h-12 mx-auto mb-2', 'text-' + statusColor + '-400')} />
            <h3 className="font-semibold">Status Geral</h3>
            <p className={clsx('text-' + statusColor + '-400')}>{health?.status || 'Carregando...'}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <Server className="w-12 h-12 mx-auto mb-2 text-primary-400" />
            <h3 className="font-semibold">Provedores</h3>
            <p className="text-dark-400">{health?.providers?.filter(p => p.isHealthy).length || 0}/{health?.providers?.length || 0} online</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <Database className="w-12 h-12 mx-auto mb-2 text-success-400" />
            <h3 className="font-semibold">Cache</h3>
            <p className="text-dark-400">{((health?.cache?.hitRate || 0) * 100).toFixed(0)}% hit rate</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <HardDrive className="w-12 h-12 mx-auto mb-2 text-cyan-400" />
            <h3 className="font-semibold">MemoryStore</h3>
            <p className="text-dark-400">{health?.memoryStore?.pools || 0} pools ({health?.memoryStore?.estimatedKB || 0} KB)</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <Activity className="w-12 h-12 mx-auto mb-2 text-warning-400" />
            <h3 className="font-semibold">Alertas Hoje</h3>
            <p className="text-dark-400">{health?.alerts?.triggersToday || 0}</p>
          </div>
        </div>
      </div>

      {health?.memoryStore && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">MemoryStore — Cache em Memória</h3>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-3 bg-dark-700/50 rounded-lg">
                <p className="text-2xl font-bold text-cyan-400">{health.memoryStore.pools}</p>
                <p className="text-sm text-dark-400">Pools</p>
              </div>
              <div className="p-3 bg-dark-700/50 rounded-lg">
                <p className="text-2xl font-bold text-green-400">{health.memoryStore.hitRatePct}%</p>
                <p className="text-sm text-dark-400">Hit Rate</p>
              </div>
              <div className="p-3 bg-dark-700/50 rounded-lg">
                <p className="text-2xl font-bold text-primary-400">{health.memoryStore.reads}</p>
                <p className="text-sm text-dark-400">Reads</p>
              </div>
              <div className="p-3 bg-dark-700/50 rounded-lg">
                <p className="text-2xl font-bold text-yellow-400">{health.memoryStore.estimatedKB} KB</p>
                <p className="text-sm text-dark-400">RAM Estimada</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4 text-sm text-dark-400">
              <span>Hits: {health.memoryStore.hits}</span>
              <span>Misses: {health.memoryStore.misses}</span>
              <span>Writes: {health.memoryStore.writes}</span>
              <span>Watchlist: {health.memoryStore.watchlist}</span>
              <span className={health.memoryStore.recsFresh ? 'text-green-400' : 'text-yellow-400'}>
                Recs: {health.memoryStore.hasRecs ? (health.memoryStore.recsFresh ? 'Fresh' : 'Stale') : 'None'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Provedores de Dados</h3>
          </div>
          <div className="card-body space-y-3">
            {health?.providers?.map((p) => (
              <div key={p.name} className="flex items-center justify-between p-3 bg-dark-700/50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={clsx('w-3 h-3 rounded-full', p.isHealthy ? 'bg-success-500' : 'bg-danger-500')} />
                  <span className="font-medium">{p.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {p.isCircuitOpen && <span className="badge badge-danger">Circuit Open</span>}
                  {p.consecutiveFailures > 0 && (
                    <span className="text-sm text-dark-400">{p.consecutiveFailures + ' falhas'}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Logs Recentes</h3>
          </div>
          <div className="card-body">
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {logs?.map((log, i) => (
                <div key={i} className="flex items-start gap-2 text-sm p-2 bg-dark-700/50 rounded">
                  <span className={clsx(
                    'badge text-xs',
                    log.level === 'ERROR' ? 'badge-danger' : 
                    log.level === 'WARN' ? 'badge-warning' : 'badge-primary'
                  )}>
                    {log.level}
                  </span>
                  <span className="text-dark-400">[{log.component}]</span>
                  <span className="flex-1 truncate">{log.message}</span>
                  <span className="text-xs text-dark-400">{format(new Date(log.timestamp), 'HH:mm:ss')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
