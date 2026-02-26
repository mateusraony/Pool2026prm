import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Database, Server, Clock, AlertTriangle, CheckCircle, XCircle, HardDrive, Copy, Check } from 'lucide-react';
import { fetchHealth, fetchLogs } from '../api/client';
import { format } from 'date-fns';
import clsx from 'clsx';

export default function StatusPage() {
  const [copied, setCopied] = useState(false);

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 10000,
  });

  const { data: logs } = useQuery({
    queryKey: ['logs'],
    queryFn: () => fetchLogs(50), // Busca mais logs para debug
    refetchInterval: 30000,
  });

  const statusColor = health?.status === 'HEALTHY' ? 'success' : health?.status === 'DEGRADED' ? 'warning' : 'danger';
  const StatusIcon = health?.status === 'HEALTHY' ? CheckCircle : health?.status === 'DEGRADED' ? AlertTriangle : XCircle;

  // Função para copiar logs + status completo para clipboard
  const copyLogsToClipboard = async () => {
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

    // Monta relatório completo para debug
    let report = `=== POOL INTELLIGENCE PRO - DEBUG REPORT ===\n`;
    report += `Gerado em: ${timestamp}\n\n`;

    // Status do sistema
    report += `--- STATUS DO SISTEMA ---\n`;
    report += `Status: ${health?.status || 'N/A'}\n`;
    report += `Timestamp: ${health?.timestamp || 'N/A'}\n\n`;

    // Provedores
    report += `--- PROVEDORES ---\n`;
    health?.providers?.forEach(p => {
      report += `${p.name}: ${p.isHealthy ? 'OK' : 'FALHA'} | Circuit: ${p.isCircuitOpen ? 'OPEN' : 'closed'} | Falhas: ${p.consecutiveFailures}\n`;
    });
    report += `\n`;

    // Cache
    report += `--- CACHE ---\n`;
    report += `Hit Rate: ${((health?.cache?.hitRate || 0) * 100).toFixed(1)}%\n`;
    report += `Hits: ${health?.cache?.hits || 0} | Misses: ${health?.cache?.misses || 0} | Sets: ${health?.cache?.sets || 0} | Keys: ${health?.cache?.keys || 0}\n\n`;

    // MemoryStore
    if (health?.memoryStore) {
      report += `--- MEMORY STORE ---\n`;
      report += `Pools: ${health.memoryStore.pools} | Scores: ${health.memoryStore.scores} | Watchlist: ${health.memoryStore.watchlist}\n`;
      report += `Hit Rate: ${health.memoryStore.hitRatePct}% | Reads: ${health.memoryStore.reads} | Hits: ${health.memoryStore.hits} | Misses: ${health.memoryStore.misses}\n`;
      report += `Writes: ${health.memoryStore.writes} | RAM: ~${health.memoryStore.estimatedKB} KB\n`;
      report += `Recs: ${health.memoryStore.hasRecs ? (health.memoryStore.recsFresh ? 'Fresh' : 'Stale') : 'None'}\n\n`;
    }

    // Alertas
    report += `--- ALERTAS ---\n`;
    report += `Rules: ${health?.alerts?.rulesCount || 0} | Recentes: ${health?.alerts?.recentAlertsCount || 0} | Hoje: ${health?.alerts?.triggersToday || 0}\n\n`;

    // Logs
    report += `--- LOGS RECENTES (${logs?.length || 0}) ---\n`;
    logs?.forEach(log => {
      const time = format(new Date(log.timestamp), 'HH:mm:ss');
      report += `[${time}] ${log.level.padEnd(5)} [${log.component}] ${log.message}\n`;
    });

    report += `\n=== FIM DO RELATÓRIO ===\n`;

    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback para navegadores sem suporte a clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
            <p className="text-dark-400">
              {health?.providers?.filter(p => p.isHealthy && !p.isOptional).length || 0}/
              {health?.providers?.filter(p => !p.isOptional).length || 0} online
            </p>
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
              <div key={p.name} className={clsx('flex items-center justify-between p-3 rounded-lg', p.isOptional ? 'bg-dark-800/40 opacity-70' : 'bg-dark-700/50')}>
                <div className="flex items-center gap-3">
                  <div className={clsx('w-3 h-3 rounded-full', p.isHealthy ? 'bg-success-500' : p.isOptional ? 'bg-dark-500' : 'bg-danger-500')} />
                  <span className="font-medium">{p.name}</span>
                  {p.isOptional && <span className="text-xs text-dark-500 italic">(opcional)</span>}
                </div>
                <div className="flex items-center gap-2">
                  {p.isHealthy && <span className="badge badge-success text-xs">OK</span>}
                  {!p.isHealthy && !p.isOptional && <span className="badge badge-danger text-xs">FALHA</span>}
                  {!p.isHealthy && p.isOptional && p.note && (
                    <span className="text-xs text-dark-500 max-w-xs truncate" title={p.note}>{p.note}</span>
                  )}
                  {p.isCircuitOpen && <span className="badge badge-danger text-xs">Circuit Open</span>}
                  {p.consecutiveFailures > 0 && !p.isOptional && (
                    <span className="text-sm text-dark-400">{p.consecutiveFailures} falhas</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold">Logs Recentes</h3>
            <button
              onClick={copyLogsToClipboard}
              className={clsx(
                'btn btn-sm flex items-center gap-2 transition-all',
                copied ? 'btn-success' : 'btn-secondary'
              )}
              title="Copiar relatório completo para debug"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copiado!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copiar Logs
                </>
              )}
            </button>
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
              {(!logs || logs.length === 0) && (
                <p className="text-dark-400 text-center py-4">Nenhum log disponível</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
