import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Activity, DollarSign, Clock, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';

interface RangeMetricsProps {
  // Range
  rangeLower: number;
  rangeUpper: number;
  currentPrice: number;

  // Capital
  capitalUsd: number;

  // Métricas base (do range otimizado)
  baseMetrics: {
    feesEstimate7d: number; // %
    ilEstimate7d: number; // %
    gasEstimate: number; // USD
    timeInRange7d: number; // %
  };

  // Pool info
  feeTier: number;
  volume24h: number;
  tvl: number;
}

export default function RangeMetrics({
  rangeLower,
  rangeUpper,
  currentPrice,
  capitalUsd,
  baseMetrics,
  // Reserved for future advanced calculations
  feeTier: _feeTier,
  volume24h: _volume24h,
  tvl: _tvl,
}: RangeMetricsProps) {
  // Suppress unused variable warnings (reserved for future use)
  void _feeTier;
  void _volume24h;
  void _tvl;
  // Calcula métricas ajustadas baseado na largura do range
  const metrics = useMemo(() => {
    // Largura do range como % do preço atual
    const rangeWidth = ((rangeUpper - rangeLower) / currentPrice) * 100;

    // Range mais estreito = mais fees mas mais IL e menos tempo no range
    // Range mais largo = menos fees mas menos IL e mais tempo no range

    // Fator de ajuste (range de 10% = 1.0, range mais estreito = maior que 1)
    const widthFactor = 10 / rangeWidth;

    // Ajusta fees (range estreito = mais concentrado = mais fees proporcionais)
    const feesMultiplier = Math.min(2.5, Math.max(0.3, widthFactor));
    const adjustedFees = baseMetrics.feesEstimate7d * feesMultiplier;

    // Ajusta IL (range estreito = mais risco de sair do range = mais IL potencial)
    const ilMultiplier = Math.min(3, Math.max(0.2, widthFactor * 1.2));
    const adjustedIL = baseMetrics.ilEstimate7d * ilMultiplier;

    // Ajusta tempo no range (range largo = mais tempo dentro)
    const timeMultiplier = Math.min(1.2, Math.max(0.3, 1 / widthFactor));
    const adjustedTimeInRange = Math.min(98, baseMetrics.timeInRange7d * timeMultiplier);

    // Gas estimado (fixo por rede)
    const gasEstimate = baseMetrics.gasEstimate;

    // Retorno líquido
    const netReturn = adjustedFees - adjustedIL - (gasEstimate / capitalUsd) * 100;

    // Valores em USD
    const feesUsd = (adjustedFees / 100) * capitalUsd;
    const ilUsd = (adjustedIL / 100) * capitalUsd;
    const netReturnUsd = (netReturn / 100) * capitalUsd;

    // APR estimado (anualizado)
    const apr = netReturn * (365 / 7);

    // Nível de risco
    let riskLevel: 'low' | 'medium' | 'high';
    if (rangeWidth > 20) {
      riskLevel = 'low';
    } else if (rangeWidth > 8) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'high';
    }

    return {
      rangeWidth,
      feesPercent: adjustedFees,
      feesUsd,
      ilPercent: adjustedIL,
      ilUsd,
      gasEstimate,
      timeInRange: adjustedTimeInRange,
      netReturnPercent: netReturn,
      netReturnUsd,
      apr,
      riskLevel,
    };
  }, [rangeLower, rangeUpper, currentPrice, capitalUsd, baseMetrics]);

  const isCurrentInRange = currentPrice >= rangeLower && currentPrice <= rangeUpper;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Projeção (7 dias)</h3>
        <span className={clsx(
          'badge',
          metrics.riskLevel === 'low' && 'badge-success',
          metrics.riskLevel === 'medium' && 'badge-warning',
          metrics.riskLevel === 'high' && 'badge-danger',
        )}>
          Risco {metrics.riskLevel === 'low' ? 'Baixo' : metrics.riskLevel === 'medium' ? 'Médio' : 'Alto'}
        </span>
      </div>

      {/* Status do preço */}
      {!isCurrentInRange && (
        <div className="bg-warning-500/10 border border-warning-500/30 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-5 h-5 text-warning-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-warning-400 font-medium">Preço fora do range</p>
            <p className="text-dark-400">Você não ganhará fees enquanto o preço estiver fora do range selecionado.</p>
          </div>
        </div>
      )}

      {/* Métricas principais */}
      <div className="grid grid-cols-2 gap-3">
        {/* Fees */}
        <div className="bg-dark-800 rounded-lg p-3">
          <div className="flex items-center gap-2 text-dark-400 mb-1">
            <TrendingUp className="w-4 h-4 text-success-400" />
            <span className="text-sm">Fees Estimadas</span>
          </div>
          <div className="text-success-400 font-semibold">
            +{metrics.feesPercent.toFixed(2)}%
          </div>
          <div className="text-sm text-dark-400">
            ~${metrics.feesUsd.toFixed(2)}
          </div>
        </div>

        {/* IL */}
        <div className="bg-dark-800 rounded-lg p-3">
          <div className="flex items-center gap-2 text-dark-400 mb-1">
            <TrendingDown className="w-4 h-4 text-danger-400" />
            <span className="text-sm">IL Estimada</span>
          </div>
          <div className="text-danger-400 font-semibold">
            -{metrics.ilPercent.toFixed(2)}%
          </div>
          <div className="text-sm text-dark-400">
            ~${metrics.ilUsd.toFixed(2)}
          </div>
        </div>

        {/* Tempo no Range */}
        <div className="bg-dark-800 rounded-lg p-3">
          <div className="flex items-center gap-2 text-dark-400 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Tempo no Range</span>
          </div>
          <div className="font-semibold">
            {metrics.timeInRange.toFixed(0)}%
          </div>
          <div className="text-sm text-dark-400">
            do período
          </div>
        </div>

        {/* Gas */}
        <div className="bg-dark-800 rounded-lg p-3">
          <div className="flex items-center gap-2 text-dark-400 mb-1">
            <Activity className="w-4 h-4" />
            <span className="text-sm">Custo de Gas</span>
          </div>
          <div className="font-semibold">
            ~${metrics.gasEstimate.toFixed(2)}
          </div>
          <div className="text-sm text-dark-400">
            entrada + rebalance
          </div>
        </div>
      </div>

      {/* Retorno Líquido (destaque) */}
      <div className={clsx(
        'rounded-lg p-4 border',
        metrics.netReturnPercent >= 0
          ? 'bg-success-500/10 border-success-500/30'
          : 'bg-danger-500/10 border-danger-500/30'
      )}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className={clsx(
              'w-5 h-5',
              metrics.netReturnPercent >= 0 ? 'text-success-400' : 'text-danger-400'
            )} />
            <span className="font-medium">Retorno Líquido (7d)</span>
          </div>
          <div className={clsx(
            'text-xl font-bold',
            metrics.netReturnPercent >= 0 ? 'text-success-400' : 'text-danger-400'
          )}>
            {metrics.netReturnPercent >= 0 ? '+' : ''}{metrics.netReturnPercent.toFixed(2)}%
          </div>
        </div>
        <div className="flex items-center justify-between mt-2 text-sm">
          <span className="text-dark-400">Valor estimado:</span>
          <span className={clsx(
            'font-medium',
            metrics.netReturnPercent >= 0 ? 'text-success-400' : 'text-danger-400'
          )}>
            {metrics.netReturnUsd >= 0 ? '+' : ''}${metrics.netReturnUsd.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-1 text-sm">
          <span className="text-dark-400">APR estimado:</span>
          <span className="font-medium text-primary-400">
            {metrics.apr.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Fórmula explicativa */}
      <div className="text-xs text-dark-400 text-center">
        Retorno = Fees ({metrics.feesPercent.toFixed(2)}%) - IL ({metrics.ilPercent.toFixed(2)}%) - Gas ({((metrics.gasEstimate / capitalUsd) * 100).toFixed(2)}%)
      </div>
    </div>
  );
}
