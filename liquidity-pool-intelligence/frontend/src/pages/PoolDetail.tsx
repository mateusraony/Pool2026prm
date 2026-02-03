import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  AlertTriangle,
  TrendingUp,
  Clock,
  DollarSign,
  Activity,
  ExternalLink,
} from 'lucide-react';
import { fetchPoolDetail, createPosition, runBacktest } from '../api/client';
import clsx from 'clsx';

export default function PoolDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [selectedRange, setSelectedRange] = useState<string>('OPTIMIZED');
  const [customCapital, setCustomCapital] = useState<number>(0);
  const [backtestResult, setBacktestResult] = useState<any>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['pool', id],
    queryFn: () => fetchPoolDetail(id!),
    enabled: !!id,
  });

  const createPositionMutation = useMutation({
    mutationFn: createPosition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      alert('Posição criada com sucesso!');
    },
  });

  const handleCreatePosition = (isSimulation: boolean) => {
    if (!data || !selectedRangeData) return;

    createPositionMutation.mutate({
      poolId: data.pool.id,
      isSimulation,
      priceLower: parseFloat(selectedRangeData.priceLower),
      priceUpper: parseFloat(selectedRangeData.priceUpper),
      capitalUsd: customCapital || selectedRangeData.capitalUsd,
    });
  };

  const handleRunBacktest = async () => {
    if (!data || !selectedRangeData) return;

    try {
      const result = await runBacktest(data.pool.id, {
        priceLower: parseFloat(selectedRangeData.priceLower),
        priceUpper: parseFloat(selectedRangeData.priceUpper),
        capitalUsd: customCapital || selectedRangeData.capitalUsd,
        period: '7d',
      });
      setBacktestResult(result.backtest);
    } catch (err) {
      console.error('Backtest failed:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card text-center py-12">
        <AlertTriangle className="w-12 h-12 text-danger-400 mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Pool não encontrada</h2>
        <Link to="/pools" className="text-primary-400 hover:text-primary-300">
          Voltar para pools
        </Link>
      </div>
    );
  }

  const { pool, ranges } = data;
  const selectedRangeData = ranges.find((r) => r.rangeType === selectedRange);

  const formatFeeTier = (tier: number) => `${(tier / 10000).toFixed(2)}%`;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/pools"
        className="inline-flex items-center text-dark-400 hover:text-dark-100"
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Voltar para pools
      </Link>

      {/* Header */}
      <div className="card">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold">
                {pool.token0Symbol}/{pool.token1Symbol}
              </h1>
              <span className="badge badge-info">{formatFeeTier(pool.feeTier)}</span>
              <span className="badge badge-info capitalize">{pool.network}</span>
            </div>
            <p className="text-dark-400">Uniswap V3 · {pool.address.substring(0, 10)}...</p>
          </div>

          <a
            href={`https://app.uniswap.org/pools/${pool.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary inline-flex items-center"
          >
            Ver no Uniswap
            <ExternalLink className="w-4 h-4 ml-2" />
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <StatBox label="TVL" value={`$${(pool.tvlUsd / 1000000).toFixed(2)}M`} />
          <StatBox label="Volume 24h" value={`$${(pool.volume24hUsd / 1000000).toFixed(2)}M`} />
          <StatBox label="Volume 7d" value={`$${(pool.volume7dUsd / 1000000).toFixed(2)}M`} />
          <StatBox
            label="APR Est."
            value={pool.aprEstimate ? `${pool.aprEstimate.toFixed(1)}%` : 'N/A'}
            highlight
          />
        </div>
      </div>

      {/* Range Selection */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {ranges.map((range) => (
          <button
            key={range.rangeType}
            onClick={() => setSelectedRange(range.rangeType)}
            className={clsx(
              'card text-left transition-all',
              selectedRange === range.rangeType
                ? 'ring-2 ring-primary-500 border-primary-500'
                : 'hover:border-dark-500'
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <span
                className={clsx(
                  'font-semibold',
                  range.rangeType === 'DEFENSIVE'
                    ? 'text-success-400'
                    : range.rangeType === 'OPTIMIZED'
                    ? 'text-primary-400'
                    : 'text-warning-400'
                )}
              >
                {range.rangeType === 'DEFENSIVE'
                  ? 'Range Defensivo'
                  : range.rangeType === 'OPTIMIZED'
                  ? 'Range Otimizado'
                  : 'Range Agressivo'}
              </span>
              <span className={clsx('text-lg font-bold', getScoreColor(range.score))}>
                {range.score}
              </span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-dark-400">Retorno 7d:</span>
                <span className="text-success-400">+{range.netReturn7d.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Fees Est.:</span>
                <span>{range.feesEstimate7d.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">IL Est.:</span>
                <span className="text-danger-400">{range.ilEstimate7d.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Tempo no range:</span>
                <span>{range.timeInRange7d.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-dark-400">Capital:</span>
                <span>${range.capitalUsd.toLocaleString()}</span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-dark-700">
              <span
                className={clsx(
                  'badge',
                  range.riskLevel === 'low'
                    ? 'badge-success'
                    : range.riskLevel === 'medium'
                    ? 'badge-warning'
                    : 'badge-danger'
                )}
              >
                Risco {range.riskLevel === 'low' ? 'Baixo' : range.riskLevel === 'medium' ? 'Médio' : 'Alto'}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Selected Range Details */}
      {selectedRangeData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Projeções */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Projeções (7 dias)</h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
                <div className="flex items-center">
                  <TrendingUp className="w-5 h-5 text-success-400 mr-3" />
                  <span>Fees Estimadas</span>
                </div>
                <span className="text-success-400 font-semibold">
                  +{selectedRangeData.feesEstimate7d.toFixed(2)}%
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
                <div className="flex items-center">
                  <Activity className="w-5 h-5 text-danger-400 mr-3" />
                  <span>IL Estimada</span>
                </div>
                <span className="text-danger-400 font-semibold">
                  -{selectedRangeData.ilEstimate7d.toFixed(2)}%
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg">
                <div className="flex items-center">
                  <DollarSign className="w-5 h-5 text-dark-400 mr-3" />
                  <span>Custo de Gas</span>
                </div>
                <span className="font-semibold">
                  ~${selectedRangeData.gasEstimate.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 bg-primary-500/10 rounded-lg border border-primary-500/30">
                <div className="flex items-center">
                  <TrendingUp className="w-5 h-5 text-primary-400 mr-3" />
                  <span className="font-semibold">Retorno Líquido</span>
                </div>
                <span className="text-primary-400 font-bold text-lg">
                  +{selectedRangeData.netReturn7d.toFixed(2)}%
                </span>
              </div>
            </div>

            {/* Backtest Button */}
            <button
              onClick={handleRunBacktest}
              className="btn btn-secondary w-full mt-4"
            >
              Rodar Backtest (7d)
            </button>

            {backtestResult && (
              <div className="mt-4 p-4 bg-dark-800 rounded-lg">
                <h4 className="font-semibold mb-2">Resultado do Backtest:</h4>
                <div className="space-y-1 text-sm">
                  <p>Tempo no range: {backtestResult.metrics.timeInRange.toFixed(0)}%</p>
                  <p>PnL: {backtestResult.metrics.netPnLPercent.toFixed(2)}%</p>
                  <p>Max Drawdown: {backtestResult.metrics.maxDrawdown.toFixed(2)}%</p>
                  <p>Rebalances: {backtestResult.metrics.rebalancesNeeded}</p>
                </div>
              </div>
            )}
          </div>

          {/* Capital & Actions */}
          <div className="card">
            <h3 className="text-lg font-semibold mb-4">Capital & Ação</h3>

            <div className="space-y-4">
              <div>
                <label className="label">Capital (USDT)</label>
                <input
                  type="number"
                  value={customCapital || selectedRangeData.capitalUsd}
                  onChange={(e) => setCustomCapital(parseFloat(e.target.value) || 0)}
                  className="input"
                />
                <p className="text-xs text-dark-400 mt-1">
                  Sugerido: {selectedRangeData.capitalPercent.toFixed(1)}% da banca
                </p>
              </div>

              <div>
                <label className="label">Range de Preço</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={parseFloat(selectedRangeData.priceLower).toFixed(6)}
                    className="input"
                    readOnly
                  />
                  <span className="text-dark-400">-</span>
                  <input
                    type="text"
                    value={parseFloat(selectedRangeData.priceUpper).toFixed(6)}
                    className="input"
                    readOnly
                  />
                </div>
              </div>

              <div className="p-4 bg-dark-800 rounded-lg">
                <h4 className="font-semibold mb-2">Explicação</h4>
                <p className="text-sm text-dark-300 whitespace-pre-line">
                  {selectedRangeData.explanation}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleCreatePosition(true)}
                  disabled={createPositionMutation.isPending}
                  className="btn btn-secondary flex-1"
                >
                  {createPositionMutation.isPending ? 'Criando...' : 'Simular'}
                </button>
                <button
                  onClick={() => handleCreatePosition(false)}
                  disabled={createPositionMutation.isPending}
                  className="btn btn-primary flex-1"
                >
                  Monitorar
                </button>
              </div>

              <p className="text-xs text-dark-400 text-center">
                O sistema monitora mas não executa operações on-chain.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={clsx('p-4 rounded-lg', highlight ? 'bg-primary-500/10' : 'bg-dark-800')}>
      <p className="text-sm text-dark-400">{label}</p>
      <p className={clsx('text-xl font-semibold', highlight && 'text-primary-400')}>
        {value}
      </p>
    </div>
  );
}

function getScoreColor(score: number) {
  if (score >= 70) return 'text-success-400';
  if (score >= 50) return 'text-warning-400';
  return 'text-danger-400';
}
