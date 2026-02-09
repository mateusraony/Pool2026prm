import { useState, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  AlertTriangle,
  ExternalLink,
  Check,
  Play,
} from 'lucide-react';
import { fetchPoolDetail, createPosition, runBacktest } from '../api/client';
import LiquidityChart from '../components/charts/LiquidityChart';
import RangeControls from '../components/charts/RangeControls';
import RangeMetrics from '../components/charts/RangeMetrics';

export default function PoolDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  // Estado do range customizado
  const [customRange, setCustomRange] = useState<{ lower: number; upper: number } | null>(null);
  const [capitalUsd, setCapitalUsd] = useState<number>(500);
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [isRunningBacktest, setIsRunningBacktest] = useState(false);

  // Busca dados da pool
  const { data, isLoading, error } = useQuery({
    queryKey: ['pool', id],
    queryFn: () => fetchPoolDetail(id!),
    enabled: !!id,
  });

  // Mutation para criar posição
  const createPositionMutation = useMutation({
    mutationFn: createPosition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      alert('Posição criada com sucesso!');
    },
  });

  // Dados do gráfico de liquidez (simulados se não houver dados reais)
  const liquidityData = useMemo(() => {
    if (!data) return [];

    const currentPrice = parseFloat(data.pool.currentPrice);

    // Se tiver dados reais do chart, usa
    if (data.liquidityChart && data.liquidityChart.length > 0) {
      return data.liquidityChart.map(item => ({
        price: parseFloat(item.price),
        liquidity: parseFloat(item.liquidityGross),
      }));
    }

    // Gera dados simulados baseados em distribuição normal ao redor do preço atual
    const numBars = 50;
    const priceRange = currentPrice * 0.5; // ±50% do preço atual
    const minPrice = currentPrice - priceRange;
    const bars = [];

    for (let i = 0; i < numBars; i++) {
      const price = minPrice + (priceRange * 2 * i) / numBars;
      // Distribuição normal centrada no preço atual
      const distance = Math.abs(price - currentPrice) / (priceRange * 0.3);
      const liquidity = Math.exp(-0.5 * distance * distance) * 1000000;
      bars.push({ price, liquidity });
    }

    return bars;
  }, [data]);

  // Presets de range
  const rangePresets = useMemo(() => {
    if (!data) return [];

    return data.ranges.map(range => ({
      type: range.rangeType as 'DEFENSIVE' | 'OPTIMIZED' | 'AGGRESSIVE',
      lower: parseFloat(range.priceLower),
      upper: parseFloat(range.priceUpper),
      label: range.rangeType === 'DEFENSIVE'
        ? 'Defensivo'
        : range.rangeType === 'OPTIMIZED'
        ? 'Otimizado'
        : 'Agressivo',
      description: range.rangeType === 'DEFENSIVE'
        ? 'Menos risco, menos retorno'
        : range.rangeType === 'OPTIMIZED'
        ? 'Equilíbrio risco/retorno'
        : 'Mais retorno, mais risco',
    }));
  }, [data]);

  // Range ativo (customizado ou otimizado por padrão)
  const activeRange = useMemo(() => {
    if (customRange) return customRange;

    const optimized = data?.ranges.find(r => r.rangeType === 'OPTIMIZED');
    if (optimized) {
      return {
        lower: parseFloat(optimized.priceLower),
        upper: parseFloat(optimized.priceUpper),
      };
    }

    // Fallback: ±10% do preço atual
    const currentPrice = data ? parseFloat(data.pool.currentPrice) : 1;
    return {
      lower: currentPrice * 0.9,
      upper: currentPrice * 1.1,
    };
  }, [customRange, data]);

  // Métricas base do range otimizado
  const baseMetrics = useMemo(() => {
    const optimized = data?.ranges.find(r => r.rangeType === 'OPTIMIZED');
    if (optimized) {
      return {
        feesEstimate7d: optimized.feesEstimate7d,
        ilEstimate7d: optimized.ilEstimate7d,
        gasEstimate: optimized.gasEstimate,
        timeInRange7d: optimized.timeInRange7d,
      };
    }
    return {
      feesEstimate7d: 0.5,
      ilEstimate7d: 0.2,
      gasEstimate: 5,
      timeInRange7d: 85,
    };
  }, [data]);

  // Handlers
  const handleRangeChange = useCallback((lower: number, upper: number) => {
    setCustomRange({ lower, upper });
    setBacktestResult(null); // Limpa backtest anterior
  }, []);

  const handlePresetSelect = useCallback((type: 'DEFENSIVE' | 'OPTIMIZED' | 'AGGRESSIVE') => {
    const preset = rangePresets.find(p => p.type === type);
    if (preset) {
      setCustomRange({ lower: preset.lower, upper: preset.upper });
      setBacktestResult(null);
    }
  }, [rangePresets]);

  const handleRunBacktest = async () => {
    if (!data) return;
    setIsRunningBacktest(true);

    try {
      const result = await runBacktest(data.pool.id, {
        priceLower: activeRange.lower,
        priceUpper: activeRange.upper,
        capitalUsd,
        period: '7d',
      });
      setBacktestResult(result.backtest);
    } catch (err) {
      console.error('Backtest failed:', err);
      alert('Erro ao rodar backtest');
    } finally {
      setIsRunningBacktest(false);
    }
  };

  const handleCreatePosition = (isSimulation: boolean) => {
    if (!data) return;

    createPositionMutation.mutate({
      poolId: data.pool.id,
      isSimulation,
      priceLower: activeRange.lower,
      priceUpper: activeRange.upper,
      capitalUsd,
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
      </div>
    );
  }

  // Error state
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
  const currentPrice = parseFloat(pool.currentPrice);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          to="/pools"
          className="inline-flex items-center text-dark-400 hover:text-dark-100"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar
        </Link>

        <a
          href={`https://app.uniswap.org/pools/${pool.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary inline-flex items-center text-sm"
        >
          Abrir no Uniswap
          <ExternalLink className="w-4 h-4 ml-2" />
        </a>
      </div>

      {/* Pool Info */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-2xl font-bold">
            {pool.token0Symbol}/{pool.token1Symbol}
          </h1>
          <span className="badge badge-info">{(pool.feeTier / 10000).toFixed(2)}%</span>
          <span className="badge badge-info capitalize">{pool.network}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatBox label="TVL" value={`$${(pool.tvlUsd / 1e6).toFixed(2)}M`} />
          <StatBox label="Volume 24h" value={`$${(pool.volume24hUsd / 1e6).toFixed(2)}M`} />
          <StatBox label="Volume 7d" value={`$${(pool.volume7dUsd / 1e6).toFixed(2)}M`} />
          <StatBox
            label="Preço Atual"
            value={currentPrice < 1 ? currentPrice.toPrecision(6) : currentPrice.toFixed(4)}
          />
        </div>
      </div>

      {/* Main Content - Gráfico e Controles */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico de Liquidez (ocupa 2 colunas) */}
        <div className="lg:col-span-2 card">
          <h2 className="text-lg font-semibold mb-4">
            Selecione seu Range de Liquidez
          </h2>
          <p className="text-sm text-dark-400 mb-4">
            Arraste as bordas azuis ou o range inteiro para ajustar. Use os presets abaixo para começar.
          </p>

          {/* Gráfico Interativo */}
          <LiquidityChart
            data={liquidityData}
            currentPrice={currentPrice}
            rangeLower={activeRange.lower}
            rangeUpper={activeRange.upper}
            onRangeChange={handleRangeChange}
            height={250}
          />

          {/* Controles */}
          <div className="mt-8">
            <RangeControls
              currentPrice={currentPrice}
              rangeLower={activeRange.lower}
              rangeUpper={activeRange.upper}
              presets={rangePresets}
              onRangeChange={handleRangeChange}
              onPresetSelect={handlePresetSelect}
            />
          </div>
        </div>

        {/* Painel de Métricas */}
        <div className="card">
          {/* Capital Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Capital a Investir (USDT)
            </label>
            <input
              type="number"
              value={capitalUsd}
              onChange={(e) => setCapitalUsd(parseFloat(e.target.value) || 0)}
              className="input text-lg"
              min="50"
              step="50"
            />
          </div>

          {/* Métricas Calculadas em Tempo Real */}
          <RangeMetrics
            rangeLower={activeRange.lower}
            rangeUpper={activeRange.upper}
            currentPrice={currentPrice}
            capitalUsd={capitalUsd}
            baseMetrics={baseMetrics}
            feeTier={pool.feeTier}
            volume24h={pool.volume24hUsd}
            tvl={pool.tvlUsd}
          />

          {/* Backtest Button */}
          <button
            onClick={handleRunBacktest}
            disabled={isRunningBacktest}
            className="btn btn-secondary w-full mt-4 flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" />
            {isRunningBacktest ? 'Rodando...' : 'Rodar Backtest (7d)'}
          </button>

          {/* Backtest Result */}
          {backtestResult && (
            <div className="mt-4 p-4 bg-dark-800 rounded-lg">
              <h4 className="font-semibold text-sm mb-2">Resultado do Backtest:</h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-dark-400">Tempo no range:</span>
                  <span>{backtestResult.metrics.timeInRange.toFixed(0)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">PnL:</span>
                  <span className={backtestResult.metrics.netPnLPercent >= 0 ? 'text-success-400' : 'text-danger-400'}>
                    {backtestResult.metrics.netPnLPercent >= 0 ? '+' : ''}{backtestResult.metrics.netPnLPercent.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Max Drawdown:</span>
                  <span className="text-danger-400">{backtestResult.metrics.maxDrawdown.toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Rebalances:</span>
                  <span>{backtestResult.metrics.rebalancesNeeded}</span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-6 space-y-3">
            <button
              onClick={() => handleCreatePosition(true)}
              disabled={createPositionMutation.isPending || capitalUsd < 50}
              className="btn btn-secondary w-full"
            >
              {createPositionMutation.isPending ? 'Criando...' : 'Simular Posição'}
            </button>

            <button
              onClick={() => handleCreatePosition(false)}
              disabled={createPositionMutation.isPending || capitalUsd < 50}
              className="btn btn-primary w-full flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Confirmar e Monitorar
            </button>
          </div>

          <p className="text-xs text-dark-400 text-center mt-3">
            O sistema monitora, mas não executa operações on-chain.
          </p>
        </div>
      </div>

      {/* Explicação do Range Selecionado */}
      {ranges.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-2">Sobre este Range</h3>
          <p className="text-sm text-dark-300">
            {ranges.find(r => r.rangeType === 'OPTIMIZED')?.explanation ||
             'Este range foi calculado com base no histórico de preços e volume da pool. Ranges mais estreitos oferecem maior retorno potencial, mas com maior risco de o preço sair da faixa. Ranges mais largos são mais seguros, mas geram menos fees proporcionalmente.'}
          </p>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-dark-800 p-3 rounded-lg">
      <p className="text-sm text-dark-400">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
