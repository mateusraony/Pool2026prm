import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, Database, Server, Clock, AlertTriangle, CheckCircle, XCircle,
  HardDrive, Copy, Check, Cpu, Zap, BarChart3, Timer
} from 'lucide-react';
import { fetchHealth, fetchLogs } from '../api/client';
import { WebVitalsWidget } from '../components/common/WebVitalsWidget';
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
    queryFn: () => fetchLogs(50),
    refetchInterval: 30000,
  });

  const statusColor = health?.status === 'HEALTHY' ? 'success' : health?.status === 'DEGRADED' ? 'warning' : 'danger';
  const StatusIcon = health?.status === 'HEALTHY' ? CheckCircle : health?.status === 'DEGRADED' ? AlertTriangle : XCircle;

  // Função para copiar logs + status completo para clipboard
  const copyLogsToClipboard = async () => {
    const timestamp = format(new Date(), 'yyyy-MM-dd HH:mm:ss');

    let report = `=== POOL INTELLIGENCE PRO - DEBUG REPORT ===\n`;
    report += `Gerado em: ${timestamp}\n\n`;

    report += `--- STATUS DO SISTEMA ---\n`;
    report += `Status: ${health?.status || 'N/A'}\n`;
    report += `Uptime: ${health?.uptime?.formatted || 'N/A'}\n`;
    report += `Timestamp: ${health?.timestamp || 'N/A'}\n\n`;

    if (health?.memory) {
      report += `--- MEMÓRIA ---\n`;
      report += `RSS: ${health.memory.rssMB} MB | Heap: ${health.memory.heapUsedMB} MB\n\n`;
    }

    report += `--- PROVEDORES ---\n`;
    health?.providers?.forEach(p => {
      report += `${p.name}: ${p.isHealthy ? 'OK' : 'FALHA'} | Circuit: ${p.isCircuitOpen ? 'OPEN' : 'closed'} | Falhas: ${p.consecutiveFailures}\n`;
    });
    report += `\n`;

    report += `--- CACHE ---\n`;
    report += `Hit Rate: ${((health?.cache?.hitRate || 0) * 100).toFixed(1)}%\n`;
    report += `Hits: ${health?.cache?.hits || 0} | Misses: ${health?.cache?.misses || 0} | Sets: ${health?.cache?.sets || 0} | Keys: ${health?.cache?.keys || 0}\n\n`;

    if (health?.memoryStore) {
      report += `--- MEMORY STORE ---\n`;
      report += `Pools: ${health.memoryStore.pools} | Scores: ${health.memoryStore.scores} | Watchlist: ${health.memoryStore.watchlist}\n`;
      report += `Hit Rate: ${health.memoryStore.hitRatePct}% | Reads: ${health.memoryStore.reads} | Hits: ${health.memoryStore.hits} | Misses: ${health.memoryStore.misses}\n`;
      report += `Writes: ${health.memoryStore.writes} | RAM: ~${health.memoryStore.estimatedKB} KB\n`;
      report += `Recs: ${health.memoryStore.hasRecs ? (health.memoryStore.recsFresh ? 'Fresh' : 'Stale') : 'None'}\n\n`;
    }

    if (health?.requests) {
      report += `--- REQUESTS ---\n`;
      report += `Total: ${health.requests.totalRequests} | Erros: ${health.requests.totalErrors} | Taxa Erro: ${health.requests.errorRate.toFixed(1)}%\n`;
      report += `Latência Média: ${health.requests.avgDurationMs.toFixed(0)}ms\n\n`;
    }

    if (health?.jobs) {
      report += `--- JOBS ---\n`;
      Object.entries(health.jobs).forEach(([name, job]) => {
        report += `${name}: ${job.totalRuns} runs | ${job.successes} ok | ${job.failures} fail | avg ${job.avgDurationMs.toFixed(0)}ms\n`;
      });
      report += `\n`;
    }

    report += `--- ALERTAS ---\n`;
    report += `Rules: ${health?.alerts?.rulesCount || 0} | Recentes: ${health?.alerts?.recentAlertsCount || 0} | Hoje: ${health?.alerts?.triggersToday || 0}\n\n`;

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

  // Helper: formata bytes em MB
  const formatMB = (mb?: number) => mb != null ? `${mb.toFixed(1)} MB` : 'N/A';

  // Helper: formata milissegundos
  const formatMs = (ms?: number) => ms != null ? `${ms.toFixed(0)}ms` : 'N/A';

  // Top endpoints por contagem
  const topEndpoints = health?.requests?.byEndpoint
    ? Object.entries(health.requests.byEndpoint)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 8)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="w-6 h-6 text-primary" /> Status do Sistema</h1>
        <p className="text-muted-foreground mt-1">Monitoramento em tempo real</p>
      </div>

      {/* === TOP CARDS === */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="card">
          <div className="card-body text-center">
            <StatusIcon className={clsx('w-10 h-10 mx-auto mb-2', 'text-' + statusColor + '-400')} />
            <h3 className="font-semibold text-sm">Status</h3>
            <p className={clsx('text-sm', 'text-' + statusColor + '-400')}>{health?.status || 'Carregando...'}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <Clock className="w-10 h-10 mx-auto mb-2 text-blue-400" />
            <h3 className="font-semibold text-sm">Uptime</h3>
            <p className="text-sm text-muted-foreground">{health?.uptime?.formatted || '...'}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <Server className="w-10 h-10 mx-auto mb-2 text-primary-400" />
            <h3 className="font-semibold text-sm">Provedores</h3>
            <p className="text-sm text-muted-foreground">
              {health?.providers?.filter(p => p.isHealthy && !p.isOptional).length || 0}/
              {health?.providers?.filter(p => !p.isOptional).length || 0} online
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <Cpu className="w-10 h-10 mx-auto mb-2 text-purple-400" />
            <h3 className="font-semibold text-sm">Memória</h3>
            <p className="text-sm text-muted-foreground">{formatMB(health?.memory?.rssMB)}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <Zap className="w-10 h-10 mx-auto mb-2 text-yellow-400" />
            <h3 className="font-semibold text-sm">Requests</h3>
            <p className="text-sm text-muted-foreground">{health?.requests?.totalRequests ?? '...'}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <Activity className="w-10 h-10 mx-auto mb-2 text-warning-400" />
            <h3 className="font-semibold text-sm">Error Rate</h3>
            <p className={clsx(
              'text-sm',
              (health?.requests?.errorRate ?? 0) > 5 ? 'text-danger-400' :
              (health?.requests?.errorRate ?? 0) > 1 ? 'text-warning-400' : 'text-success-400'
            )}>
              {health?.requests?.errorRate != null ? `${health.requests.errorRate.toFixed(1)}%` : '...'}
            </p>
          </div>
        </div>
      </div>

      {/* === MEMÓRIA DO SERVIDOR === */}
      {health?.memory && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold flex items-center gap-2"><Cpu className="w-4 h-4" /> Memória do Servidor</h3>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-purple-400">{health.memory.rssMB.toFixed(1)}</p>
                <p className="text-sm text-muted-foreground">RSS (MB)</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-blue-400">{health.memory.heapUsedMB.toFixed(1)}</p>
                <p className="text-sm text-muted-foreground">Heap Used (MB)</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-cyan-400">
                  {((health.memory.heapUsedBytes / health.memory.heapTotalBytes) * 100).toFixed(0)}%
                </p>
                <p className="text-sm text-muted-foreground">Heap Usage</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className={clsx(
                  'text-2xl font-bold',
                  health.memory.rssMB > 400 ? 'text-danger-400' : health.memory.rssMB > 300 ? 'text-warning-400' : 'text-success-400'
                )}>
                  {health.memory.rssMB > 400 ? 'ALTO' : health.memory.rssMB > 300 ? 'MÉDIO' : 'OK'}
                </p>
                <p className="text-sm text-muted-foreground">RAM Status</p>
              </div>
            </div>
            {/* Barra visual RSS vs limite Render (512MB) */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>RSS: {health.memory.rssMB.toFixed(1)} MB</span>
                <span>Limite Render: 512 MB</span>
              </div>
              <div className="w-full bg-muted rounded-full h-3">
                <div
                  className={clsx(
                    'h-3 rounded-full transition-all duration-500',
                    health.memory.rssMB > 400 ? 'bg-danger-500' : health.memory.rssMB > 300 ? 'bg-warning-500' : 'bg-success-500'
                  )}
                  style={{ width: `${Math.min(100, (health.memory.rssMB / 512) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === REQUESTS & ENDPOINTS === */}
      {health?.requests && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4" /> Requests (última hora)</h3>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-blue-400">{health.requests.totalRequests}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className={clsx('text-2xl font-bold', health.requests.totalErrors > 0 ? 'text-danger-400' : 'text-success-400')}>
                  {health.requests.totalErrors}
                </p>
                <p className="text-sm text-muted-foreground">Erros</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className={clsx(
                  'text-2xl font-bold',
                  health.requests.errorRate > 5 ? 'text-danger-400' : health.requests.errorRate > 1 ? 'text-warning-400' : 'text-success-400'
                )}>
                  {health.requests.errorRate.toFixed(1)}%
                </p>
                <p className="text-sm text-muted-foreground">Error Rate</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg text-center">
                <p className="text-2xl font-bold text-primary-400">{formatMs(health.requests.avgDurationMs)}</p>
                <p className="text-sm text-muted-foreground">Latência Média</p>
              </div>
            </div>

            {/* Tabela de endpoints */}
            {topEndpoints.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border/60">
                      <th className="text-left py-2 px-2">Endpoint</th>
                      <th className="text-right py-2 px-2">Requests</th>
                      <th className="text-right py-2 px-2">Avg</th>
                      <th className="text-right py-2 px-2">P95</th>
                      <th className="text-right py-2 px-2">Max</th>
                      <th className="text-right py-2 px-2">Erros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topEndpoints.map(([endpoint, stats]) => (
                      <tr key={endpoint} className="border-b border-border/40 hover:bg-muted/30">
                        <td className="py-2 px-2 font-mono text-xs">{endpoint}</td>
                        <td className="text-right py-2 px-2">{stats.count}</td>
                        <td className="text-right py-2 px-2 text-muted-foreground">{stats.avgMs.toFixed(0)}ms</td>
                        <td className="text-right py-2 px-2 text-muted-foreground">{stats.p95Ms.toFixed(0)}ms</td>
                        <td className="text-right py-2 px-2 text-muted-foreground">{stats.maxMs.toFixed(0)}ms</td>
                        <td className={clsx('text-right py-2 px-2', stats.errors > 0 ? 'text-danger-400' : 'text-muted-foreground')}>
                          {stats.errors}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* === JOBS === */}
      {health?.jobs && Object.keys(health.jobs).length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold flex items-center gap-2"><Timer className="w-4 h-4" /> Background Jobs</h3>
          </div>
          <div className="card-body">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(health.jobs).map(([name, job]) => {
                const successRate = job.totalRuns > 0 ? (job.successes / job.totalRuns) * 100 : 0;
                return (
                  <div key={name} className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-sm">{name}</span>
                      <span className={clsx(
                        'badge text-xs',
                        successRate >= 90 ? 'badge-success' : successRate >= 50 ? 'badge-warning' : 'badge-danger'
                      )}>
                        {successRate.toFixed(0)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <div>
                        <span className="block text-foreground">{job.totalRuns}</span>
                        <span>runs</span>
                      </div>
                      <div>
                        <span className={clsx('block', job.failures > 0 ? 'text-danger-400' : 'text-foreground')}>{job.failures}</span>
                        <span>falhas</span>
                      </div>
                      <div>
                        <span className="block text-foreground">{job.avgDurationMs.toFixed(0)}ms</span>
                        <span>avg</span>
                      </div>
                    </div>
                    {job.lastRunAt && (
                      <p className="text-xs text-muted-foreground/60 mt-2">
                        Último: {format(new Date(job.lastRunAt), 'HH:mm:ss')}
                        {job.lastDurationMs != null && ` (${job.lastDurationMs.toFixed(0)}ms)`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* === LOG SUMMARY === */}
      {health?.logs && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Resumo de Logs (última hora)</h3>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-blue-400">{health.logs.INFO}</p>
                <p className="text-sm text-muted-foreground">INFO</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className={clsx('text-2xl font-bold', health.logs.WARN > 0 ? 'text-warning-400' : 'text-muted-foreground')}>{health.logs.WARN}</p>
                <p className="text-sm text-muted-foreground">WARN</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className={clsx('text-2xl font-bold', health.logs.ERROR > 0 ? 'text-danger-400' : 'text-muted-foreground')}>{health.logs.ERROR}</p>
                <p className="text-sm text-muted-foreground">ERROR</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className={clsx('text-2xl font-bold', health.logs.CRITICAL > 0 ? 'text-danger-400 animate-pulse' : 'text-muted-foreground')}>{health.logs.CRITICAL}</p>
                <p className="text-sm text-muted-foreground">CRITICAL</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* === MEMORYSTORE (existente) === */}
      {health?.memoryStore && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">MemoryStore — Cache em Memória</h3>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-cyan-400">{health.memoryStore.pools}</p>
                <p className="text-sm text-muted-foreground">Pools</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-green-400">{health.memoryStore.hitRatePct}%</p>
                <p className="text-sm text-muted-foreground">Hit Rate</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-primary-400">{health.memoryStore.reads}</p>
                <p className="text-sm text-muted-foreground">Reads</p>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-2xl font-bold text-yellow-400">{health.memoryStore.estimatedKB} KB</p>
                <p className="text-sm text-muted-foreground">RAM Estimada</p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
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

      {/* === WEB VITALS === */}
      <WebVitalsWidget />

      {/* === PROVEDORES + LOGS (existente) === */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Provedores de Dados</h3>
          </div>
          <div className="card-body space-y-3">
            {health?.providers?.map((p) => (
              <div key={p.name} className={clsx('flex items-center justify-between p-3 rounded-lg', p.isOptional ? 'bg-muted/40 opacity-70' : 'bg-muted/50')}>
                <div className="flex items-center gap-3">
                  <div className={clsx('w-3 h-3 rounded-full', p.isHealthy ? 'bg-success-500' : p.isOptional ? 'bg-muted-foreground/40' : 'bg-danger-500')} />
                  <span className="font-medium">{p.name}</span>
                  {p.isOptional && <span className="text-xs text-muted-foreground/60 italic">(opcional)</span>}
                </div>
                <div className="flex items-center gap-2">
                  {p.isHealthy && <span className="badge badge-success text-xs">OK</span>}
                  {!p.isHealthy && !p.isOptional && <span className="badge badge-danger text-xs">FALHA</span>}
                  {!p.isHealthy && p.isOptional && p.note && (
                    <span className="text-xs text-muted-foreground/60 max-w-xs truncate" title={p.note}>{p.note}</span>
                  )}
                  {p.isCircuitOpen && <span className="badge badge-danger text-xs">Circuit Open</span>}
                  {p.consecutiveFailures > 0 && !p.isOptional && (
                    <span className="text-sm text-muted-foreground">{p.consecutiveFailures} falhas</span>
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
                <div key={i} className="flex items-start gap-2 text-sm p-2 bg-muted/50 rounded">
                  <span className={clsx(
                    'badge text-xs',
                    log.level === 'ERROR' ? 'badge-danger' :
                    log.level === 'WARN' ? 'badge-warning' : 'badge-primary'
                  )}>
                    {log.level}
                  </span>
                  <span className="text-muted-foreground">[{log.component}]</span>
                  <span className="flex-1 truncate">{log.message}</span>
                  <span className="text-xs text-muted-foreground">{(() => { const d = new Date(log.timestamp); return isNaN(d.getTime()) ? log.timestamp : format(d, 'HH:mm:ss'); })()}</span>
                </div>
              ))}
              {(!logs || logs.length === 0) && (
                <p className="text-muted-foreground text-center py-4">Nenhum log disponível</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* === CACHE (existente, mantido) === */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold flex items-center gap-2"><Database className="w-4 h-4" /> Cache HTTP</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-success-400">{((health?.cache?.hitRate || 0) * 100).toFixed(0)}%</p>
              <p className="text-sm text-muted-foreground">Hit Rate</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-blue-400">{health?.cache?.hits || 0}</p>
              <p className="text-sm text-muted-foreground">Hits</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-foreground">{health?.cache?.misses || 0}</p>
              <p className="text-sm text-muted-foreground">Misses</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-primary-400">{health?.cache?.sets || 0}</p>
              <p className="text-sm text-muted-foreground">Sets</p>
            </div>
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold text-cyan-400">{health?.cache?.keys || 0}</p>
              <p className="text-sm text-muted-foreground">Keys</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
