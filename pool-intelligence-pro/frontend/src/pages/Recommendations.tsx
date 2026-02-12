import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Brain, TrendingUp, TrendingDown, AlertTriangle, Clock, Target } from 'lucide-react';
import { fetchRecommendations, Recommendation } from '../api/client';
import { format } from 'date-fns';
import clsx from 'clsx';

function formatNum(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
  return num.toFixed(2);
}

function RecommendationCard({ rec, index }: { rec: Recommendation; index: number }) {
  const isPositive = rec.estimatedGainPercent >= 0;
  const poolName = rec.pool.token0.symbol + '/' + rec.pool.token1.symbol;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="card overflow-hidden"
    >
      <div className={clsx(
        'px-6 py-3 flex items-center justify-between',
        rec.rank === 1 ? 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20' :
        rec.rank === 2 ? 'bg-gradient-to-r from-gray-400/20 to-gray-500/20' :
        'bg-gradient-to-r from-amber-700/20 to-amber-800/20'
      )}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{rec.rank === 1 ? '🥇' : rec.rank === 2 ? '🥈' : '🥉'}</span>
          <div>
            <h3 className="font-bold text-lg">{poolName}</h3>
            <p className="text-sm text-dark-400">{rec.pool.protocol} - {rec.pool.chain}</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold">{rec.score.total.toFixed(0)}</div>
          <div className="text-xs text-dark-400">Score</div>
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
              {isPositive ? '+' : ''}{rec.estimatedGainPercent.toFixed(2)}%
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Ganho Est. (USD)</div>
            <div className={clsx('stat-value', isPositive ? 'text-success-400' : 'text-danger-400')}>
              {isPositive ? '+' : ''}{'$' + rec.estimatedGainUsd.toFixed(2)}
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

        <div className="flex items-center justify-between text-sm text-dark-400 pt-4 border-t border-dark-600">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Valido ate: {format(new Date(rec.validUntil), 'dd/MM/yyyy HH:mm')}
          </div>
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4" />
            Modo: {rec.mode}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function RecommendationsPage() {
  const { data: recommendations, isLoading } = useQuery({
    queryKey: ['recommendations'],
    queryFn: fetchRecommendations,
    refetchInterval: 60000,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">🧠 Recomendacoes IA</h1>
        <p className="text-dark-400 mt-1">Top 3 oportunidades analisadas por inteligencia artificial</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1,2,3].map((i) => (
            <div key={i} className="card animate-pulse"><div className="p-6 space-y-4"><div className="h-20 bg-dark-700 rounded" /><div className="h-40 bg-dark-700 rounded" /></div></div>
          ))}
        </div>
      ) : recommendations && recommendations.length > 0 ? (
        <div className="space-y-6">
          {recommendations.map((rec, index) => (<RecommendationCard key={rec.rank} rec={rec} index={index} />))}
        </div>
      ) : (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-4">🤖</div>
          <h3 className="text-lg font-semibold mb-2">Aguardando analise</h3>
          <p className="text-dark-400">A IA esta processando as melhores oportunidades...</p>
        </div>
      )}
    </div>
  );
}
