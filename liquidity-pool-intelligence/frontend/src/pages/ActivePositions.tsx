import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Eye,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { fetchPositions, closePosition } from '../api/client';
import clsx from 'clsx';

interface Position {
  id: string;
  poolId: string;
  isSimulation: boolean;
  capitalUsd: number;
  priceLower: string;
  priceUpper: string;
  entryDate: string;
  status: 'ACTIVE' | 'ATTENTION' | 'CRITICAL' | 'CLOSED';
  feesAccrued: number;
  ilAccrued: number;
  pnlUsd: number;
  pool: {
    network: string;
    token0Symbol: string;
    token1Symbol: string;
    feeTier: number;
    currentPrice: string;
  };
}

export default function ActivePositions() {
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['positions', { status: 'ACTIVE' }],
    queryFn: () => fetchPositions({ status: 'ACTIVE' }),
  });

  const closePositionMutation = useMutation({
    mutationFn: closePosition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
  });

  const handleClosePosition = (positionId: string) => {
    if (confirm('Tem certeza que deseja encerrar esta posição?')) {
      closePositionMutation.mutate(positionId);
    }
  };

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
        <h2 className="text-xl font-semibold mb-2">Erro ao carregar posições</h2>
      </div>
    );
  }

  const positions: Position[] = data?.positions || [];
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Posições Ativas</h1>
          <p className="text-dark-400 mt-1">
            Acompanhe suas posições de liquidez ativas
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="btn btn-secondary inline-flex items-center"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            label="Total de Posições"
            value={summary.totalPositions.toString()}
          />
          <SummaryCard
            label="Capital Total"
            value={`$${summary.totalCapitalUsd.toLocaleString()}`}
          />
          <SummaryCard
            label="Fees Acumuladas"
            value={`$${summary.totalFeesAccrued.toFixed(2)}`}
            positive
          />
          <SummaryCard
            label="PnL Total"
            value={`$${summary.totalPnLUsd.toFixed(2)}`}
            positive={summary.totalPnLUsd >= 0}
          />
        </div>
      )}

      {/* Positions List */}
      {positions.length === 0 ? (
        <div className="card text-center py-12">
          <div className="text-dark-400 mb-4">
            Nenhuma posição ativa no momento
          </div>
          <Link to="/pools" className="btn btn-primary">
            Explorar Pools
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {positions.map((position) => (
            <PositionCard
              key={position.id}
              position={position}
              onClose={() => handleClosePosition(position.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="card">
      <p className="text-sm text-dark-400">{label}</p>
      <p
        className={clsx(
          'text-xl font-semibold',
          positive === true && 'text-success-400',
          positive === false && 'text-danger-400'
        )}
      >
        {value}
      </p>
    </div>
  );
}

function PositionCard({
  position,
  onClose,
}: {
  position: Position;
  onClose: () => void;
}) {
  const pnlPercent = position.capitalUsd > 0
    ? ((position.pnlUsd / position.capitalUsd) * 100).toFixed(2)
    : '0.00';

  const isInRange = (() => {
    const current = parseFloat(position.pool.currentPrice);
    const lower = parseFloat(position.priceLower);
    const upper = parseFloat(position.priceUpper);
    return current >= lower && current <= upper;
  })();

  return (
    <div className="card">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Pool Info */}
        <div className="flex items-start gap-4">
          <StatusIcon status={position.status} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">
                {position.pool.token0Symbol}/{position.pool.token1Symbol}
              </span>
              <span className="badge badge-info text-xs">
                {(position.pool.feeTier / 10000).toFixed(2)}%
              </span>
              <span className="badge badge-info text-xs capitalize">
                {position.pool.network}
              </span>
              {position.isSimulation && (
                <span className="badge badge-warning text-xs">Simulação</span>
              )}
            </div>
            <p className="text-sm text-dark-400 mt-1">
              Capital: ${position.capitalUsd.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Range Status */}
        <div className="text-center">
          <p className="text-sm text-dark-400">Range</p>
          <div className="flex items-center gap-2">
            {isInRange ? (
              <span className="text-success-400 text-sm flex items-center">
                <CheckCircle className="w-4 h-4 mr-1" />
                Dentro
              </span>
            ) : (
              <span className="text-danger-400 text-sm flex items-center">
                <XCircle className="w-4 h-4 mr-1" />
                Fora
              </span>
            )}
          </div>
        </div>

        {/* Performance */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-sm text-dark-400">Fees</p>
            <p className="text-success-400 font-semibold">
              +${position.feesAccrued.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-dark-400">IL</p>
            <p className="text-danger-400 font-semibold">
              -${Math.abs(position.ilAccrued).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-dark-400">PnL</p>
            <p
              className={clsx(
                'font-semibold',
                position.pnlUsd >= 0 ? 'text-success-400' : 'text-danger-400'
              )}
            >
              {position.pnlUsd >= 0 ? '+' : ''}${position.pnlUsd.toFixed(2)} ({pnlPercent}%)
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Link
            to={`/pools/${position.poolId}`}
            className="btn btn-secondary inline-flex items-center"
          >
            <Eye className="w-4 h-4 mr-1" />
            Detalhes
          </Link>
          <button onClick={onClose} className="btn btn-danger">
            Encerrar
          </button>
        </div>
      </div>

      {/* Entry Info */}
      <div className="mt-4 pt-4 border-t border-dark-700 flex flex-wrap gap-4 text-sm text-dark-400">
        <span>
          Entrada: {new Date(position.entryDate).toLocaleDateString('pt-BR')}
        </span>
        <span>
          Range: {parseFloat(position.priceLower).toFixed(6)} -{' '}
          {parseFloat(position.priceUpper).toFixed(6)}
        </span>
        <span>
          Preço atual: {parseFloat(position.pool.currentPrice).toFixed(6)}
        </span>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'ACTIVE':
      return (
        <div className="w-10 h-10 rounded-full bg-success-500/20 flex items-center justify-center">
          <CheckCircle className="w-5 h-5 text-success-400" />
        </div>
      );
    case 'ATTENTION':
      return (
        <div className="w-10 h-10 rounded-full bg-warning-500/20 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-warning-400" />
        </div>
      );
    case 'CRITICAL':
      return (
        <div className="w-10 h-10 rounded-full bg-danger-500/20 flex items-center justify-center">
          <XCircle className="w-5 h-5 text-danger-400" />
        </div>
      );
    default:
      return null;
  }
}
