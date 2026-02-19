import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Brain, TrendingUp, TrendingDown, AlertTriangle, Clock, Target, Filter, ArrowRight, ExternalLink } from 'lucide-react';
import { fetchRecommendations, Recommendation } from '../api/client';
import { format } from 'date-fns';
import clsx from 'clsx';

type Mode = 'ALL' | 'DEFENSIVE' | 'NORMAL' | 'AGGRESSIVE';

const modeConfig: Record<Mode, { label: string; emoji: string; color: string; description: string }> = {
  ALL: { label: 'Todos', emoji: '🌐', color: 'primary', description: 'Todas as estrategias' },
  DEFENSIVE: { label: 'Defensivo', emoji: '🛡️', color: 'success', description: 'Menor risco, retorno estavel' },
  NORMAL: { label: 'Normal', emoji: '⚖️', color: 'warning', description: 'Equilibrio risco/retorno' },
  AGGRESSIVE: { label: 'Agressivo', emoji: '🎯', color: 'danger', description: 'Maior potencial, maior risco' },
};

function formatNum(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
  return num.toFixed(2);
}

function RecommendationCard({ rec, index }: { rec: Recommendation; index: number }) {
  const navigate = useNavigate();
  const isPositive = (rec.estimatedGainPercent ?? 0) >= 0;
  const poolName = (rec.pool.token0?.symbol ?? '?') + '/' + (rec.pool.token1?.symbol ?? '?');
  // Defensive: use externalId as fallback
  const poolAddress = rec.pool.poolAddress || rec.pool.externalId || 'unknown';
  const poolPath = '/simulation/' + rec.pool.chain + '/' + poolAddress;

  const rankColors = ['from-yellow-500/20 to-orange-500/20', 'from-gray-400/20 to-gray-500/20', 'from-amber-700/20 to-amber-800/20'];
  const rankEmojis = ['🥇', '🥈', '🥉'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="card overflow-hidden"
    >
      <div className={clsx(
        'px-6 py-3 flex items-center justify-between',
        index < 3 ? 'bg-gradient-to-r ' + rankColors[index] : 'bg-dark-700/50'
      )}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{index < 3 ? rankEmojis[index] : '🏅'}</span>
          <div>
            <h3 className="font-bold text-lg">{poolName}</h3>
            <p className="text-sm text-dark-400">{rec.pool.protocol} - {rec.pool.chain}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className={clsx('badge', 'badge-' + modeConfig[rec.mode as Mode]?.color)}>
            {modeConfig[rec.mode as Mode]?.emoji} {rec.mode}
          </span>
          <div className="text-right">
            <div className="text-2xl font-bold">{(rec.score?.total ?? 0).toFixed(0)}</div>
            <div className="text-xs text-dark-400">Score</div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="stat-card">
            <div className="stat-label">Probabilidade</div>
            <div className="stat-value text-primary-400">{rec.probability}%</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Retorno Est. (7d)</div>
            <div className={clsx('stat-value', isPositive ? 'text-success-400' : 'text-danger-400')}>
              {isPositive ? '+' : ''}{(rec.estimatedGainPercent ?? 0).toFixed(2)}%
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Ganho Est. (USD)</div>
            <div className={clsx('stat-value', isPositive ? 'text-success-400' : 'text-danger-400')}>
              {isPositive ? '+' : ''}{'$' + (rec.estimatedGainUsd ?? 0).toFixed(2)}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Capital Base</div>
            <div className="stat-value">{'$' + formatNum(rec.capitalUsed)}</div>
          </div>
        </div>

        <div className="bg-dark-700/50 rounded-xl p-4">
          <h4 className="font-semibold mb-2 flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary-400" />
            Analise IA
          </h4>
          <p className="text-dark-300 text-sm leading-relaxed">{rec.commentary}</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-success-500/10 border border-success-500/30 rounded-xl p-4">
            <h4 className="font-semibold text-success-400 mb-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Condicoes de Entrada
            </h4>
            <ul className="text-sm space-y-1 text-dark-300">
              {rec.entryConditions.map((c, i) => <li key={i}>• {c}</li>)}
            </ul>
          </div>

          <div className="bg-danger-500/10 border border-danger-500/30 rounded-xl p-4">
            <h4 className="font-semibold text-danger-400 mb-2 flex items-center gap-2">
              <TrendingDown className="w-4 h-4" />
              Condicoes de Saida
            </h4>
            <ul className="text-sm space-y-1 text-dark-300">
              {rec.exitConditions.map((c, i) => <li key={i}>• {c}</li>)}
            </ul>
          </div>

          <div className="bg-warning-500/10 border border-warning-500/30 rounded-xl p-4">
            <h4 className="font-semibold text-warning-400 mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Riscos Principais
            </h4>
            <ul className="text-sm space-y-1 text-dark-300">
              {rec.mainRisks.map((r, i) => <li key={i}>• {r}</li>)}
            </ul>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-dark-600">
          <div className="flex items-center gap-4 text-sm text-dark-400">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Valido ate: {format(new Date(rec.validUntil), 'dd/MM/yyyy HH:mm')}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(poolPath)}
              className="btn btn-secondary flex items-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              Simular
            </button>
            <a
              href={'https://app.uniswap.org/add/' + (rec.pool.token0?.address ?? '') + '/' + (rec.pool.token1?.address ?? '') + '?chain=' + rec.pool.chain}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              Abrir Uniswap
            </a>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function RecommendationsPage() {
  const [selectedMode, setSelectedMode] = useState<Mode>('ALL');
  const [limit, setLimit] = useState(10);

  const { data: recommendations, isLoading } = useQuery({
    queryKey: ['recommendations', selectedMode, limit],
    queryFn: () => fetchRecommendations(
      selectedMode === 'ALL' ? undefined : selectedMode,
      limit
    ),
    refetchInterval: 60000,
  });

  const filteredRecs = recommendations || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">🧠 Recomendacoes IA</h1>
          <p className="text-dark-400 mt-1">
            Top {limit} oportunidades analisadas por inteligencia artificial
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-dark-400" />
          <select
            className="input py-2"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          >
            <option value={5}>Top 5</option>
            <option value={10}>Top 10</option>
            <option value={15}>Top 15</option>
            <option value={20}>Top 20</option>
          </select>
        </div>
      </div>

      {/* Mode Filter */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.keys(modeConfig) as Mode[]).map((mode) => {
          const config = modeConfig[mode];
          return (
            <button
              key={mode}
              onClick={() => setSelectedMode(mode)}
              className={clsx(
                'p-4 rounded-xl border-2 transition-all text-left',
                selectedMode === mode
                  ? 'border-primary-500 bg-primary-500/10'
                  : 'border-dark-600 hover:border-dark-500'
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{config.emoji}</span>
                <span className="font-semibold">{config.label}</span>
              </div>
              <p className="text-xs text-dark-400">{config.description}</p>
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse">
              <div className="p-6 space-y-4">
                <div className="h-20 bg-dark-700 rounded" />
                <div className="h-40 bg-dark-700 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredRecs.length > 0 ? (
        <div className="space-y-6">
          {filteredRecs.map((rec, index) => (
            <RecommendationCard key={rec.pool.externalId + '-' + index} rec={rec} index={index} />
          ))}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-4">🤖</div>
          <h3 className="text-lg font-semibold mb-2">
            {selectedMode === 'ALL'
              ? 'Aguardando analise'
              : 'Nenhuma recomendacao ' + modeConfig[selectedMode].label.toLowerCase()}
          </h3>
          <p className="text-dark-400">
            {selectedMode === 'ALL'
              ? 'A IA esta processando as melhores oportunidades...'
              : 'Tente selecionar outro modo de estrategia'}
          </p>
        </div>
      )}
    </div>
  );
}
