import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Filter,
  Search,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { fetchRecommendedPools } from '../api/client';
import clsx from 'clsx';

export default function PoolsRecommended() {
  const [network, setNetwork] = useState<string>('');
  const [pairType, setPairType] = useState<string>('');
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['pools', 'recommended', network, pairType],
    queryFn: () =>
      fetchRecommendedPools({
        network: network || undefined,
        pairType: pairType || undefined,
        limit: 50,
      }),
    refetchInterval: 60000,
  });

  const filteredPools = data?.pools.filter((p) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      p.pool.token0Symbol.toLowerCase().includes(searchLower) ||
      p.pool.token1Symbol.toLowerCase().includes(searchLower) ||
      p.pool.network.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Pools Recomendadas</h1>
        <p className="text-dark-400">
          Pools analisadas com sugestões de range e capital
        </p>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-dark-400" />
              <input
                type="text"
                placeholder="Buscar por par ou rede..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10"
              />
            </div>
          </div>

          {/* Network filter */}
          <div className="w-48">
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              className="input"
            >
              <option value="">Todas as redes</option>
              <option value="ethereum">Ethereum</option>
              <option value="arbitrum">Arbitrum</option>
              <option value="base">Base</option>
            </select>
          </div>

          {/* Pair type filter */}
          <div className="w-48">
            <select
              value={pairType}
              onChange={(e) => setPairType(e.target.value)}
              className="input"
            >
              <option value="">Todos os tipos</option>
              <option value="stable_stable">Estável/Estável</option>
              <option value="bluechip_stable">Bluechip/Estável</option>
              <option value="altcoin_stable">Altcoin/Estável</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card text-center py-12">
          <AlertTriangle className="w-12 h-12 text-danger-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Erro ao carregar pools</h2>
          <p className="text-dark-400">Tente novamente mais tarde.</p>
        </div>
      )}

      {/* Pool List */}
      {!isLoading && !error && filteredPools && (
        <div className="space-y-4">
          {filteredPools.length === 0 ? (
            <div className="card text-center py-12">
              <Filter className="w-12 h-12 text-dark-500 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Nenhuma pool encontrada</h2>
              <p className="text-dark-400">Ajuste os filtros ou aguarde o próximo scan.</p>
            </div>
          ) : (
            filteredPools.map((item) => (
              <PoolCard key={item.pool.id} data={item} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PoolCard({ data }: { data: { pool: any; ranges: any[]; bestRange: any; overallScore: number } }) {
  const { pool, ranges, bestRange, overallScore } = data;

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-success-400';
    if (score >= 50) return 'text-warning-400';
    return 'text-danger-400';
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case 'low':
        return <span className="badge badge-success">Baixo</span>;
      case 'medium':
        return <span className="badge badge-warning">Médio</span>;
      case 'high':
        return <span className="badge badge-danger">Alto</span>;
      default:
        return null;
    }
  };

  const formatFeeTier = (tier: number) => {
    return `${(tier / 10000).toFixed(2)}%`;
  };

  return (
    <div className="card hover:border-primary-500/50 transition-colors">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Pool Info */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold">
              {pool.token0Symbol}/{pool.token1Symbol}
            </h3>
            <span className="badge badge-info">{formatFeeTier(pool.feeTier)}</span>
            <span className="text-sm text-dark-400 capitalize">{pool.network}</span>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-dark-400">TVL: </span>
              <span className="text-dark-100">
                ${(pool.tvlUsd / 1000000).toFixed(2)}M
              </span>
            </div>
            <div>
              <span className="text-dark-400">Volume 24h: </span>
              <span className="text-dark-100">
                ${(pool.volume24hUsd / 1000000).toFixed(2)}M
              </span>
            </div>
            {pool.aprEstimate && (
              <div>
                <span className="text-dark-400">APR Est.: </span>
                <span className="text-success-400">{pool.aprEstimate.toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Score & Best Range */}
        {bestRange && (
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-sm text-dark-400">Score</p>
              <p className={clsx('text-2xl font-bold', getScoreColor(overallScore))}>
                {overallScore}
              </p>
            </div>

            <div className="text-center">
              <p className="text-sm text-dark-400">Retorno 7d</p>
              <p className="text-xl font-semibold text-success-400">
                +{bestRange.netReturn7d.toFixed(2)}%
              </p>
            </div>

            <div className="text-center">
              <p className="text-sm text-dark-400">Capital</p>
              <p className="text-xl font-semibold">
                ${bestRange.capitalUsd.toLocaleString()}
              </p>
            </div>

            <div className="text-center">
              <p className="text-sm text-dark-400">Risco</p>
              <div className="mt-1">{getRiskBadge(bestRange.riskLevel)}</div>
            </div>
          </div>
        )}

        {/* Action */}
        <div className="flex items-center">
          <Link
            to={`/pools/${encodeURIComponent(pool.id)}`}
            className="btn btn-primary flex items-center"
          >
            Ver Detalhes
            <ExternalLink className="w-4 h-4 ml-2" />
          </Link>
        </div>
      </div>

      {/* Range Summary */}
      {ranges.length > 0 && (
        <div className="mt-4 pt-4 border-t border-dark-700">
          <p className="text-sm text-dark-400 mb-2">Ranges Sugeridos:</p>
          <div className="flex flex-wrap gap-2">
            {ranges.map((range) => (
              <div
                key={range.rangeType}
                className={clsx(
                  'px-3 py-1 rounded-lg text-sm',
                  range.rangeType === 'DEFENSIVE'
                    ? 'bg-success-500/20 text-success-400'
                    : range.rangeType === 'OPTIMIZED'
                    ? 'bg-primary-500/20 text-primary-400'
                    : 'bg-warning-500/20 text-warning-400'
                )}
              >
                {range.rangeType === 'DEFENSIVE'
                  ? 'Defensivo'
                  : range.rangeType === 'OPTIMIZED'
                  ? 'Otimizado'
                  : 'Agressivo'}
                : +{range.netReturn7d.toFixed(2)}%
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
