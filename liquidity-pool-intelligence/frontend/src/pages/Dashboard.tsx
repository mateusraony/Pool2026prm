import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertTriangle,
  ArrowRight,
  DollarSign,
  Activity,
} from 'lucide-react';
import { fetchDashboard } from '../api/client';
import clsx from 'clsx';

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 30000, // 30 segundos
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="card text-center py-12">
        <AlertTriangle className="w-12 h-12 text-danger-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Erro ao carregar dashboard</h2>
        <p className="text-dark-400">Verifique se o backend está rodando.</p>
      </div>
    );
  }

  const { settings, portfolio, positions, alerts, opportunities } = data!;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-dark-400">
            Visão geral do seu portfólio de liquidez
          </p>
        </div>
        {settings && (
          <div className="text-right">
            <p className="text-sm text-dark-400">Banca Total</p>
            <p className="text-2xl font-bold text-primary-400">
              ${settings.totalBankroll.toLocaleString()}
            </p>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          label="Capital Alocado"
          value={`$${portfolio.totalCapitalDeployed.toLocaleString()}`}
          subValue={
            settings
              ? `${((portfolio.totalCapitalDeployed / settings.totalBankroll) * 100).toFixed(1)}% da banca`
              : undefined
          }
        />
        <StatCard
          icon={portfolio.totalPnL >= 0 ? TrendingUp : TrendingDown}
          label="PnL Total"
          value={`${portfolio.totalPnL >= 0 ? '+' : ''}$${portfolio.totalPnL.toFixed(2)}`}
          valueColor={portfolio.totalPnL >= 0 ? 'success' : 'danger'}
        />
        <StatCard
          icon={Wallet}
          label="Posições Ativas"
          value={portfolio.activePositions.toString()}
          subValue={
            portfolio.positionsNeedingAttention > 0
              ? `${portfolio.positionsNeedingAttention} precisam de atenção`
              : 'Todas em bom estado'
          }
          subValueColor={portfolio.positionsNeedingAttention > 0 ? 'warning' : 'success'}
        />
        <StatCard
          icon={Activity}
          label="Fees Acumuladas"
          value={`$${portfolio.totalFeesAccrued.toFixed(2)}`}
          subValue="Receita total"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Positions */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">Posições Ativas</h2>
            <Link
              to="/positions"
              className="text-sm text-primary-400 hover:text-primary-300 flex items-center"
            >
              Ver todas <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>

          {positions.length === 0 ? (
            <div className="text-center py-8 text-dark-400">
              <Wallet className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Nenhuma posição ativa</p>
              <Link
                to="/pools"
                className="text-primary-400 hover:text-primary-300 text-sm"
              >
                Explorar pools recomendadas
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {positions.slice(0, 5).map((pos) => (
                <Link
                  key={pos.id}
                  to={`/pools/${encodeURIComponent(pos.poolId)}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-dark-800/50 hover:bg-dark-800 transition-colors"
                >
                  <div>
                    <div className="flex items-center">
                      <span className="font-medium">{pos.pair}</span>
                      {pos.isSimulation && (
                        <span className="ml-2 badge badge-info">Simulação</span>
                      )}
                    </div>
                    <p className="text-sm text-dark-400">{pos.network}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">${pos.capitalUsd.toLocaleString()}</p>
                    <p
                      className={clsx(
                        'text-sm',
                        pos.pnlUsd >= 0 ? 'text-success-400' : 'text-danger-400'
                      )}
                    >
                      {pos.pnlUsd >= 0 ? '+' : ''}${pos.pnlUsd.toFixed(2)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Opportunities */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">Top Oportunidades</h2>
            <Link
              to="/pools"
              className="text-sm text-primary-400 hover:text-primary-300 flex items-center"
            >
              Ver todas <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>

          {opportunities.length === 0 ? (
            <div className="text-center py-8 text-dark-400">
              <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>Nenhuma oportunidade encontrada</p>
              <p className="text-sm">Aguarde o próximo scan</p>
            </div>
          ) : (
            <div className="space-y-3">
              {opportunities.map((opp) => (
                <Link
                  key={opp.poolId}
                  to={`/pools/${encodeURIComponent(opp.poolId)}`}
                  className="flex items-center justify-between p-3 rounded-lg bg-dark-800/50 hover:bg-dark-800 transition-colors"
                >
                  <div>
                    <div className="flex items-center">
                      <span className="font-medium">{opp.pair}</span>
                      <span
                        className={clsx(
                          'ml-2 text-sm font-medium',
                          opp.score >= 70
                            ? 'text-success-400'
                            : opp.score >= 50
                            ? 'text-warning-400'
                            : 'text-danger-400'
                        )}
                      >
                        {opp.score}/100
                      </span>
                    </div>
                    <p className="text-sm text-dark-400">{opp.network}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-success-400 font-medium">
                      +{opp.netReturn7d.toFixed(2)}%
                    </p>
                    <p className="text-sm text-dark-400">7 dias</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold flex items-center">
              <AlertTriangle className="w-5 h-5 mr-2 text-warning-400" />
              Alertas Recentes
            </h2>
          </div>
          <div className="space-y-2">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={clsx(
                  'p-3 rounded-lg flex items-center justify-between',
                  alert.severity === 'CRITICAL'
                    ? 'bg-danger-500/10 border border-danger-500/30'
                    : alert.severity === 'WARNING'
                    ? 'bg-warning-500/10 border border-warning-500/30'
                    : 'bg-primary-500/10 border border-primary-500/30'
                )}
              >
                <div>
                  <p className="font-medium">{alert.title}</p>
                  <p className="text-sm text-dark-400">
                    {new Date(alert.sentAt).toLocaleString('pt-BR')}
                  </p>
                </div>
                <span
                  className={clsx(
                    'badge',
                    alert.severity === 'CRITICAL'
                      ? 'badge-danger'
                      : alert.severity === 'WARNING'
                      ? 'badge-warning'
                      : 'badge-info'
                  )}
                >
                  {alert.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Stat Card Component
function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  valueColor,
  subValueColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
  valueColor?: 'success' | 'danger' | 'warning';
  subValueColor?: 'success' | 'danger' | 'warning';
}) {
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-dark-400">{label}</p>
          <p
            className={clsx(
              'text-2xl font-bold mt-1',
              valueColor === 'success' && 'text-success-400',
              valueColor === 'danger' && 'text-danger-400',
              valueColor === 'warning' && 'text-warning-400'
            )}
          >
            {value}
          </p>
          {subValue && (
            <p
              className={clsx(
                'text-sm mt-1',
                subValueColor === 'success'
                  ? 'text-success-400'
                  : subValueColor === 'danger'
                  ? 'text-danger-400'
                  : subValueColor === 'warning'
                  ? 'text-warning-400'
                  : 'text-dark-400'
              )}
            >
              {subValue}
            </p>
          )}
        </div>
        <div className="p-2 rounded-lg bg-dark-800">
          <Icon className="w-5 h-5 text-primary-400" />
        </div>
      </div>
    </div>
  );
}
