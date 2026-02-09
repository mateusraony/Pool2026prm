import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Filter, Clock, TrendingUp, AlertTriangle } from 'lucide-react';
import { fetchHistory } from '../api/client';
import clsx from 'clsx';

interface HistoryEntry {
  id: string;
  poolId: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
  pool: {
    network: string;
    token0Symbol: string;
    token1Symbol: string;
  };
}

export default function History() {
  const [filters, setFilters] = useState({
    action: '',
    network: '',
    startDate: '',
    endDate: '',
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['history', filters],
    queryFn: () => fetchHistory(filters),
  });

  const history: HistoryEntry[] = data?.history || [];

  const actionTypes = [
    { value: '', label: 'Todas as ações' },
    { value: 'ENTRY', label: 'Entrada' },
    { value: 'REBALANCE', label: 'Rebalance' },
    { value: 'EXIT', label: 'Saída' },
    { value: 'ALERT', label: 'Alerta' },
    { value: 'RECOMMENDATION', label: 'Recomendação' },
  ];

  const networks = [
    { value: '', label: 'Todas as redes' },
    { value: 'ethereum', label: 'Ethereum' },
    { value: 'arbitrum', label: 'Arbitrum' },
    { value: 'base', label: 'Base' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Histórico / Diário</h1>
        <p className="text-dark-400 mt-1">
          Acompanhe todas as ações e eventos das suas posições
        </p>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-dark-400" />
          <span className="font-semibold">Filtros</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="label">Ação</label>
            <select
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              className="input"
            >
              {actionTypes.map((action) => (
                <option key={action.value} value={action.value}>
                  {action.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Rede</label>
            <select
              value={filters.network}
              onChange={(e) => setFilters({ ...filters, network: e.target.value })}
              className="input"
            >
              {networks.map((network) => (
                <option key={network.value} value={network.value}>
                  {network.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Data Inicial</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="input"
            />
          </div>

          <div>
            <label className="label">Data Final</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="input"
            />
          </div>
        </div>
      </div>

      {/* History List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
        </div>
      ) : error ? (
        <div className="card text-center py-12">
          <AlertTriangle className="w-12 h-12 text-danger-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Erro ao carregar histórico</h2>
        </div>
      ) : history.length === 0 ? (
        <div className="card text-center py-12">
          <Calendar className="w-12 h-12 text-dark-500 mx-auto mb-4" />
          <p className="text-dark-400">Nenhum registro encontrado</p>
        </div>
      ) : (
        <div className="space-y-4">
          {history.map((entry) => (
            <HistoryCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryCard({ entry }: { entry: HistoryEntry }) {
  const actionConfig = getActionConfig(entry.action);

  return (
    <div className="card">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div
          className={clsx(
            'w-10 h-10 rounded-full flex items-center justify-center',
            actionConfig.bgColor
          )}
        >
          <actionConfig.icon className={clsx('w-5 h-5', actionConfig.iconColor)} />
        </div>

        {/* Content */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={clsx('font-semibold', actionConfig.textColor)}>
              {actionConfig.label}
            </span>
            <span className="text-dark-400">•</span>
            <span className="text-dark-400">
              {entry.pool.token0Symbol}/{entry.pool.token1Symbol}
            </span>
            <span className="badge badge-info text-xs capitalize">
              {entry.pool.network}
            </span>
          </div>

          {/* Details */}
          <div className="text-sm text-dark-300 mt-2">
            {renderDetails(entry.action, entry.details)}
          </div>

          {/* Timestamp */}
          <div className="flex items-center gap-1 mt-3 text-xs text-dark-400">
            <Clock className="w-3 h-3" />
            {new Date(entry.createdAt).toLocaleString('pt-BR')}
          </div>
        </div>
      </div>
    </div>
  );
}

function getActionConfig(action: string) {
  switch (action) {
    case 'ENTRY':
      return {
        label: 'Entrada',
        icon: TrendingUp,
        bgColor: 'bg-success-500/20',
        iconColor: 'text-success-400',
        textColor: 'text-success-400',
      };
    case 'EXIT':
      return {
        label: 'Saída',
        icon: TrendingUp,
        bgColor: 'bg-primary-500/20',
        iconColor: 'text-primary-400',
        textColor: 'text-primary-400',
      };
    case 'REBALANCE':
      return {
        label: 'Rebalance',
        icon: TrendingUp,
        bgColor: 'bg-warning-500/20',
        iconColor: 'text-warning-400',
        textColor: 'text-warning-400',
      };
    case 'ALERT':
      return {
        label: 'Alerta',
        icon: AlertTriangle,
        bgColor: 'bg-danger-500/20',
        iconColor: 'text-danger-400',
        textColor: 'text-danger-400',
      };
    case 'RECOMMENDATION':
      return {
        label: 'Recomendação',
        icon: TrendingUp,
        bgColor: 'bg-primary-500/20',
        iconColor: 'text-primary-400',
        textColor: 'text-primary-400',
      };
    default:
      return {
        label: action,
        icon: Clock,
        bgColor: 'bg-dark-700',
        iconColor: 'text-dark-400',
        textColor: 'text-dark-300',
      };
  }
}

function renderDetails(action: string, details: Record<string, unknown>) {
  const capitalUsd = details.capitalUsd as number | undefined;
  const rangeType = details.rangeType as string | undefined;
  const priceLower = details.priceLower as number | undefined;
  const priceUpper = details.priceUpper as number | undefined;
  const pnlUsd = details.pnlUsd as number | undefined;
  const reason = details.reason as string | undefined;
  const message = details.message as string | undefined;
  const severity = details.severity as string | undefined;

  switch (action) {
    case 'ENTRY':
      return (
        <div className="space-y-1">
          {capitalUsd !== undefined && (
            <p>Capital: ${Number(capitalUsd).toLocaleString()}</p>
          )}
          {rangeType && <p>Range: {rangeType}</p>}
          {priceLower !== undefined && priceUpper !== undefined && (
            <p>
              Faixa: {Number(priceLower).toFixed(6)} -{' '}
              {Number(priceUpper).toFixed(6)}
            </p>
          )}
        </div>
      );
    case 'EXIT':
      return (
        <div className="space-y-1">
          {pnlUsd !== undefined && (
            <p
              className={
                Number(pnlUsd) >= 0 ? 'text-success-400' : 'text-danger-400'
              }
            >
              PnL: ${Number(pnlUsd).toFixed(2)}
            </p>
          )}
          {reason && <p>Motivo: {reason}</p>}
        </div>
      );
    case 'ALERT':
      return (
        <div className="space-y-1">
          {message && <p>{message}</p>}
          {severity && (
            <p className="text-xs">Severidade: {severity}</p>
          )}
        </div>
      );
    default:
      return (
        <pre className="text-xs bg-dark-800 p-2 rounded overflow-x-auto">
          {JSON.stringify(details, null, 2)}
        </pre>
      );
  }
}
