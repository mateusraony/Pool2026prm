import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Trash2, ExternalLink, TrendingUp, TrendingDown, AlertTriangle, RefreshCw } from 'lucide-react';
import { fetchRangePositions, deleteRangePosition, RangePosition } from '../api/client';
import clsx from 'clsx';

function PositionCard({ position, onDelete }: { position: RangePosition; onDelete: () => void }) {
  const currentPrice = position.entryPrice; // Would be updated by backend
  const rangeWidth = position.rangeUpper - position.rangeLower;
  const midpoint = (position.rangeUpper + position.rangeLower) / 2;

  // Calculate position within range (0-100%)
  const pricePosition = Math.max(0, Math.min(100,
    ((currentPrice - position.rangeLower) / rangeWidth) * 100
  ));

  // Calculate distance to edges
  const distanceToLower = ((currentPrice - position.rangeLower) / currentPrice) * 100;
  const distanceToUpper = ((position.rangeUpper - currentPrice) / currentPrice) * 100;

  const isNearLower = distanceToLower < 5;
  const isNearUpper = distanceToUpper < 5;
  const isOutOfRange = currentPrice < position.rangeLower || currentPrice > position.rangeUpper;

  const modeColors = {
    DEFENSIVE: 'text-blue-400 bg-blue-500/20',
    NORMAL: 'text-green-400 bg-green-500/20',
    AGGRESSIVE: 'text-orange-400 bg-orange-500/20',
  };

  return (
    <div className={clsx(
      'bg-dark-800 rounded-xl p-4 lg:p-6 border transition-all',
      isOutOfRange ? 'border-red-500/50 bg-red-500/5' :
      (isNearLower || isNearUpper) ? 'border-yellow-500/50 bg-yellow-500/5' :
      'border-dark-600 hover:border-dark-500'
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold truncate">
              {position.token0Symbol}/{position.token1Symbol}
            </h3>
            <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', modeColors[position.mode])}>
              {position.mode}
            </span>
            {isOutOfRange && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/20 text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Fora do Range
              </span>
            )}
            {(isNearLower || isNearUpper) && !isOutOfRange && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-500/20 text-yellow-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Próximo da Saída
              </span>
            )}
          </div>
          <p className="text-sm text-dark-400 mt-1">
            {position.chain} • {position.poolAddress.slice(0, 8)}...{position.poolAddress.slice(-6)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/simulation/${position.chain}/${position.poolAddress}`}
            className="p-2 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors"
            title="Ver Simulação"
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
          <button
            onClick={onDelete}
            className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
            title="Remover Monitoramento"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Range Visualization */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-dark-400 mb-1">
          <span>Limite Inferior</span>
          <span>Preço Atual</span>
          <span>Limite Superior</span>
        </div>
        <div className="relative h-8 bg-dark-700 rounded-lg overflow-hidden">
          {/* Range bar */}
          <div className="absolute inset-y-0 left-0 right-0 flex items-center">
            {/* Lower danger zone */}
            <div
              className="h-full bg-red-500/20"
              style={{ width: '10%' }}
            />
            {/* Safe zone */}
            <div
              className="h-full bg-green-500/20 flex-1"
            />
            {/* Upper danger zone */}
            <div
              className="h-full bg-red-500/20"
              style={{ width: '10%' }}
            />
          </div>

          {/* Current price indicator */}
          <div
            className={clsx(
              'absolute top-1 bottom-1 w-1 rounded transition-all',
              isOutOfRange ? 'bg-red-500' :
              (isNearLower || isNearUpper) ? 'bg-yellow-500' :
              'bg-white'
            )}
            style={{ left: `${Math.max(2, Math.min(98, pricePosition))}%`, transform: 'translateX(-50%)' }}
          />
        </div>
        <div className="flex justify-between text-sm font-mono mt-1">
          <span className={clsx(isNearLower && 'text-yellow-400')}>${position.rangeLower.toFixed(2)}</span>
          <span className="font-bold">${currentPrice.toFixed(2)}</span>
          <span className={clsx(isNearUpper && 'text-yellow-400')}>${position.rangeUpper.toFixed(2)}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-dark-700 rounded-lg p-3">
          <p className="text-xs text-dark-400">Capital</p>
          <p className="text-lg font-bold">${position.capital.toLocaleString()}</p>
        </div>
        <div className="bg-dark-700 rounded-lg p-3">
          <p className="text-xs text-dark-400">Preço Entrada</p>
          <p className="text-lg font-bold">${position.entryPrice.toFixed(2)}</p>
        </div>
        <div className="bg-dark-700 rounded-lg p-3">
          <p className="text-xs text-dark-400 flex items-center gap-1">
            <TrendingDown className="w-3 h-3" /> Dist. Inferior
          </p>
          <p className={clsx(
            'text-lg font-bold',
            distanceToLower < 5 ? 'text-yellow-400' :
            distanceToLower < 10 ? 'text-orange-400' : 'text-green-400'
          )}>
            {distanceToLower.toFixed(1)}%
          </p>
        </div>
        <div className="bg-dark-700 rounded-lg p-3">
          <p className="text-xs text-dark-400 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Dist. Superior
          </p>
          <p className={clsx(
            'text-lg font-bold',
            distanceToUpper < 5 ? 'text-yellow-400' :
            distanceToUpper < 10 ? 'text-orange-400' : 'text-green-400'
          )}>
            {distanceToUpper.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-dark-700 flex flex-wrap items-center justify-between gap-2 text-xs text-dark-400">
        <span>Criado: {new Date(position.createdAt).toLocaleDateString('pt-BR')}</span>
        <span>Alerta: {position.alertThreshold}% do limite</span>
        {position.lastCheckedAt && (
          <span>Última verificação: {new Date(position.lastCheckedAt).toLocaleTimeString('pt-BR')}</span>
        )}
      </div>
    </div>
  );
}

export default function PositionsPage() {
  const queryClient = useQueryClient();

  const { data: positions = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['ranges'],
    queryFn: fetchRangePositions,
    refetchInterval: 60000, // Refresh every minute
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRangePosition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ranges'] });
    },
  });

  const activePositions = positions.filter(p => p.isActive);
  const inactivePositions = positions.filter(p => !p.isActive);

  // Calculate portfolio summary
  const totalCapital = activePositions.reduce((sum, p) => sum + p.capital, 0);
  const positionsAtRisk = activePositions.filter(p => {
    const distLower = ((p.entryPrice - p.rangeLower) / p.entryPrice) * 100;
    const distUpper = ((p.rangeUpper - p.entryPrice) / p.entryPrice) * 100;
    return distLower < 5 || distUpper < 5;
  }).length;

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold">Minhas Posições</h1>
          <p className="text-dark-400 mt-1">Acompanhe suas posições de liquidez monitoradas</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={clsx('w-4 h-4', isRefetching && 'animate-spin')} />
          Atualizar
        </button>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-dark-800 rounded-xl p-4 border border-dark-600">
          <p className="text-sm text-dark-400">Posições Ativas</p>
          <p className="text-2xl font-bold">{activePositions.length}</p>
        </div>
        <div className="bg-dark-800 rounded-xl p-4 border border-dark-600">
          <p className="text-sm text-dark-400">Capital Total</p>
          <p className="text-2xl font-bold">${totalCapital.toLocaleString()}</p>
        </div>
        <div className="bg-dark-800 rounded-xl p-4 border border-dark-600">
          <p className="text-sm text-dark-400">Em Risco</p>
          <p className={clsx(
            'text-2xl font-bold',
            positionsAtRisk > 0 ? 'text-yellow-400' : 'text-green-400'
          )}>
            {positionsAtRisk}
          </p>
        </div>
        <div className="bg-dark-800 rounded-xl p-4 border border-dark-600">
          <p className="text-sm text-dark-400">Monitoramento</p>
          <p className="text-2xl font-bold text-green-400">Ativo</p>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      )}

      {/* Empty State */}
      {!isLoading && positions.length === 0 && (
        <div className="text-center py-12 bg-dark-800 rounded-xl border border-dark-600">
          <div className="text-6xl mb-4">💼</div>
          <h3 className="text-xl font-semibold mb-2">Nenhuma posição monitorada</h3>
          <p className="text-dark-400 mb-6">
            Vá até a página de Simulação, configure um range e clique em "Monitorar Range"
          </p>
          <Link
            to="/simulation"
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors"
          >
            Ir para Simulação
          </Link>
        </div>
      )}

      {/* Active Positions */}
      {activePositions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-dark-300">
            Posições Ativas ({activePositions.length})
          </h2>
          <div className="grid gap-4">
            {activePositions.map((position) => (
              <PositionCard
                key={position.id}
                position={position}
                onDelete={() => {
                  if (confirm('Deseja remover o monitoramento desta posição?')) {
                    deleteMutation.mutate(position.id);
                  }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Inactive Positions */}
      {inactivePositions.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-dark-300">
            Posições Inativas ({inactivePositions.length})
          </h2>
          <div className="grid gap-4 opacity-60">
            {inactivePositions.map((position) => (
              <PositionCard
                key={position.id}
                position={position}
                onDelete={() => deleteMutation.mutate(position.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Info */}
      <div className="bg-dark-800/50 rounded-xl p-4 border border-dark-700">
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-400" />
          Como funciona o monitoramento
        </h3>
        <ul className="text-sm text-dark-400 space-y-1">
          <li>• O sistema verifica suas posições a cada 2 minutos</li>
          <li>• Você recebe alerta no Telegram quando o preço está a 5% do limite do range</li>
          <li>• Alertas são enviados no máximo 1x a cada 30 minutos por posição</li>
          <li>• Configure seu bot do Telegram nas configurações do sistema</li>
        </ul>
      </div>
    </div>
  );
}
