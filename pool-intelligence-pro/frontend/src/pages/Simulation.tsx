import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Clock, Fuel, DollarSign, AlertTriangle } from 'lucide-react';
import { fetchPool, Pool, Score } from '../api/client';
import clsx from 'clsx';

function formatNum(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
  return num.toFixed(2);
}

type Mode = 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE';

const modeConfig = {
  DEFENSIVE: { emoji: '🛡️', label: 'Defensivo', rangePercent: 15, color: 'success' },
  NORMAL: { emoji: '⚖️', label: 'Normal', rangePercent: 10, color: 'warning' },
  AGGRESSIVE: { emoji: '🎯', label: 'Agressivo', rangePercent: 5, color: 'danger' },
};

function SimulationPanel({ pool, score }: { pool: Pool; score: Score }) {
  const [mode, setMode] = useState<Mode>('NORMAL');
  const [capital, setCapital] = useState(1000);
  
  const currentPrice = pool.price || 1000;
  const config = modeConfig[mode];
  
  const metrics = useMemo(() => {
    const rangeWidth = config.rangePercent * 2;
    const widthFactor = 10 / rangeWidth;
    
    const baseFees = score.breakdown.return.aprEstimate / 52;
    const adjustedFees = baseFees * Math.min(2.5, Math.max(0.3, widthFactor));
    const adjustedIL = 0.4 * Math.min(3, Math.max(0.2, widthFactor * 1.2));
    const timeInRange = Math.min(98, 85 * Math.min(1.2, Math.max(0.3, 1 / widthFactor)));
    const gasEstimate = 12.5;
    const gasPercent = (gasEstimate / capital) * 100;
    const netReturn = adjustedFees - adjustedIL - gasPercent;
    
    return {
      feesPercent: adjustedFees,
      feesUsd: (adjustedFees / 100) * capital,
      ilPercent: adjustedIL,
      ilUsd: (adjustedIL / 100) * capital,
      timeInRange,
      gasEstimate,
      netReturnPercent: netReturn,
      netReturnUsd: (netReturn / 100) * capital,
      apr: netReturn * 52,
      rangeLower: currentPrice * (1 - config.rangePercent / 100),
      rangeUpper: currentPrice * (1 + config.rangePercent / 100),
    };
  }, [mode, capital, score, currentPrice, config.rangePercent]);

  const isPositive = metrics.netReturnPercent >= 0;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">🧪 Simulacao de Range</h2>
        </div>
        <div className="card-body space-y-6">
          <div>
            <label className="block text-sm text-dark-400 mb-2">Capital a Investir</label>
            <div className="flex items-center gap-2">
              <span className="text-dark-400 text-xl">$</span>
              <input
                type="number"
                value={capital}
                onChange={(e) => setCapital(Number(e.target.value))}
                className="input text-2xl font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-dark-400 mb-3">Modo de Operacao</label>
            <div className="grid grid-cols-3 gap-3">
              {(Object.keys(modeConfig) as Mode[]).map((m) => {
                const cfg = modeConfig[m];
                return (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={clsx(
                      'p-4 rounded-xl border-2 transition-all text-center',
                      mode === m
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-dark-600 hover:border-dark-500'
                    )}
                  >
                    <div className="text-2xl mb-1">{cfg.emoji}</div>
                    <div className="font-semibold">{cfg.label}</div>
                    <div className="text-xs text-dark-400">{'±' + cfg.rangePercent + '% range'}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-dark-700/50 rounded-xl p-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-dark-400">Range Selecionado</span>
              <span className={'badge badge-' + config.color}>{config.emoji} {config.label}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-lg font-mono">{'$' + metrics.rangeLower.toFixed(2)}</span>
              <span className="text-dark-400">↔</span>
              <span className="text-lg font-mono">{'$' + metrics.rangeUpper.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold">📈 Projecao (7 dias)</h2>
          <div className="flex items-center gap-1 text-success-400 text-sm">
            <div className="w-2 h-2 rounded-full bg-success-500 animate-pulse" />
            Ao vivo
          </div>
        </div>
        <div className="card-body space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="stat-card">
              <div className="flex items-center gap-2 text-dark-400 mb-1">
                <TrendingUp className="w-4 h-4 text-success-400" />
                <span className="text-xs">Fees Estimadas</span>
              </div>
              <div className="text-success-400 font-bold">{'+' + metrics.feesPercent.toFixed(2) + '%'}</div>
              <div className="text-xs text-dark-400">{'~$' + metrics.feesUsd.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 text-dark-400 mb-1">
                <TrendingDown className="w-4 h-4 text-danger-400" />
                <span className="text-xs">IL Estimada</span>
              </div>
              <div className="text-danger-400 font-bold">{'-' + metrics.ilPercent.toFixed(2) + '%'}</div>
              <div className="text-xs text-dark-400">{'~$' + metrics.ilUsd.toFixed(2)}</div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 text-dark-400 mb-1">
                <Clock className="w-4 h-4" />
                <span className="text-xs">Tempo no Range</span>
              </div>
              <div className="font-bold">{metrics.timeInRange.toFixed(0) + '%'}</div>
              <div className="text-xs text-dark-400">do periodo</div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 text-dark-400 mb-1">
                <Fuel className="w-4 h-4" />
                <span className="text-xs">Custo Gas</span>
              </div>
              <div className="font-bold">{'~$' + metrics.gasEstimate.toFixed(2)}</div>
              <div className="text-xs text-dark-400">entrada</div>
            </div>
          </div>

          <div className={clsx(
            'rounded-xl p-4 border',
            isPositive ? 'bg-success-500/10 border-success-500/30' : 'bg-danger-500/10 border-danger-500/30'
          )}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <DollarSign className={clsx('w-5 h-5', isPositive ? 'text-success-400' : 'text-danger-400')} />
                <span className="font-medium">Retorno Liquido (7d)</span>
              </div>
              <div className={clsx('text-2xl font-bold', isPositive ? 'text-success-400' : 'text-danger-400')}>
                {(isPositive ? '+' : '') + metrics.netReturnPercent.toFixed(2) + '%'}
              </div>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-dark-400">{'Valor: ' + (isPositive ? '+' : '') + '$' + metrics.netReturnUsd.toFixed(2)}</span>
              <span className="text-primary-400 font-medium">{'APR: ~' + metrics.apr.toFixed(1) + '%'}</span>
            </div>
          </div>

          <div className="text-center text-xs text-dark-400">
            {'Retorno = Fees (' + metrics.feesPercent.toFixed(2) + '%) - IL (' + metrics.ilPercent.toFixed(2) + '%) - Gas (' + ((metrics.gasEstimate / capital) * 100).toFixed(2) + '%)'}
          </div>

          <button className="btn btn-primary w-full py-4 text-lg">
            🚀 Simular no Uniswap
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SimulationPage() {
  const { chain, address } = useParams();
  
  const { data, isLoading } = useQuery({
    queryKey: ['pool', chain, address],
    queryFn: () => chain && address ? fetchPool(chain, address) : null,
    enabled: !!chain && !!address,
  });

  if (!chain || !address) {
    return (
      <div className="card p-8 text-center">
        <div className="text-4xl mb-4">🧪</div>
        <h3 className="text-lg font-semibold mb-2">Selecione uma pool</h3>
        <p className="text-dark-400">Escolha uma pool no Radar para simular</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="card animate-pulse p-8"><div className="h-96 bg-dark-700 rounded" /></div>;
  }

  if (!data) {
    return (
      <div className="card p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-danger-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Pool nao encontrada</h3>
      </div>
    );
  }

  const poolName = data.pool.token0.symbol + '/' + data.pool.token1.symbol;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🧪 Simulacao: {poolName}</h1>
        <p className="text-dark-400 mt-1">{data.pool.protocol} - {data.pool.chain}</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold">📊 Informacoes da Pool</h2>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="stat-card">
                  <div className="stat-label">TVL</div>
                  <div className="stat-value">{'$' + formatNum(data.pool.tvl)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Volume 24h</div>
                  <div className="stat-value">{'$' + formatNum(data.pool.volume24h)}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Score</div>
                  <div className="stat-value text-primary-400">{data.score.total.toFixed(0)}/100</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">Preco</div>
                  <div className="stat-value">{'$' + (data.pool.price?.toFixed(2) || 'N/A')}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <SimulationPanel pool={data.pool} score={data.score} />
        </div>
      </div>
    </div>
  );
}
