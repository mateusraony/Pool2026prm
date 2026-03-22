import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MainLayout } from '@/components/layout/MainLayout';
import { PoolCard } from '@/components/common/PoolCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Zap, RefreshCw, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useRiskConfig } from '@/hooks/useRiskConfig';
import { Skeleton } from '@/components/ui/skeleton';
import { ExportButton } from '@/components/common/ExportButton';
import { exportCSV, exportPrintReport, poolColumns } from '@/lib/export';
import { fetchRecommendations, addFavorite } from '@/api/client';
import { legacyPoolToViewPool } from '@/data/adapters';
import type { Pool } from '@/types/pool';

export default function ScoutRecommended() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [networkFilter, setNetworkFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'score' | 'apr' | 'tvl' | 'risk'>('score');

  const { config, loading: configLoading } = useRiskConfig();

  // React Query: auto-retry 3x, refetch every 2min, stale after 30s
  const { data: poolsData, isLoading, error: fetchError, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ['recommended-pools'],
    queryFn: () => fetchRecommendations(undefined, 50),
    refetchInterval: 120000,
    staleTime: 30000,
  });

  const allPools = useMemo(() => {
    if (!poolsData || poolsData.length === 0) return [];
    return poolsData.map((rec) => legacyPoolToViewPool({ pool: rec.pool, score: rec.score }));
  }, [poolsData]);

  // Mapa de pool id → estimatedGainPercent da recomendação original
  const gainByPoolId = useMemo(() => {
    if (!poolsData || poolsData.length === 0) return new Map<string, number>();
    return new Map(
      poolsData.map((rec) => [
        rec.pool.externalId || rec.pool.poolAddress,
        rec.estimatedGainPercent,
      ])
    );
  }, [poolsData]);

  const lastFetched = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const error = fetchError ? (fetchError instanceof Error ? fetchError.message : 'Erro ao buscar pools') : null;

  const handleRefresh = () => {
    refetch();
    toast.info('Atualizando pools...');
  };

  // Apply filters and sorting locally
  const pools = useMemo(() => {
    let filtered = [...allPools];

    if (networkFilter !== 'all') {
      filtered = filtered.filter(
        (p) => p.network.toLowerCase() === networkFilter.toLowerCase()
      );
    }

    if (riskFilter !== 'all') {
      filtered = filtered.filter((p) => p.risk === riskFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.pair.toLowerCase().includes(q) ||
          p.dex.toLowerCase().includes(q) ||
          p.network.toLowerCase().includes(q)
      );
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'score':
          return b.score - a.score;
        case 'apr':
          return b.apr - a.apr;
        case 'tvl':
          return b.tvl - a.tvl;
        case 'risk': {
          const riskOrder = { low: 0, medium: 1, high: 2 };
          return riskOrder[a.risk] - riskOrder[b.risk];
        }
        default:
          return 0;
      }
    });

    return filtered;
  }, [allPools, networkFilter, riskFilter, searchQuery, sortBy]);

  const handleFavorite = async (pool: Pool) => {
    if (!pool.poolAddress) {
      toast.error('Pool sem endereço válido — não é possível favoritar');
      return;
    }
    try {
      await addFavorite({
        poolId: pool.id,
        chain: pool.chain || pool.network,
        poolAddress: pool.poolAddress,
        token0Symbol: pool.token0,
        token1Symbol: pool.token1,
        protocol: pool.dex,
      });
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      toast.success('Pool adicionada aos favoritos');
    } catch {
      toast.error('Erro ao favoritar pool');
    }
  };

  const handleMonitor = (pool: Pool) => {
    navigate(`/pools/${pool.chain}/${pool.poolAddress}`);
  };

  const loading = isLoading || configLoading;

  return (
    <MainLayout
      title="Pools Recomendadas"
      subtitle="Melhores oportunidades filtradas com dados reais"
    >
      {/* Filters Bar */}
      <div className="glass-card p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por par, DEX ou rede..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <Select value={networkFilter} onValueChange={setNetworkFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Rede" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as redes</SelectItem>
                {config.allowedNetworks.map((network) => (
                  <SelectItem key={network} value={network}>
                    {network}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Risco" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os riscos</SelectItem>
                <SelectItem value="low">Baixo</SelectItem>
                <SelectItem value="medium">Medio</SelectItem>
                <SelectItem value="high">Alto</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Score IA</SelectItem>
                <SelectItem value="apr">APR</SelectItem>
                <SelectItem value="tvl">TVL</SelectItem>
                <SelectItem value="risk">Risco</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>

            <ExportButton
              disabled={pools.length === 0}
              onExportCSV={() => exportCSV(pools, poolColumns, `pools-recomendadas-${new Date().toISOString().slice(0, 10)}`)}
              onExportPDF={() => exportPrintReport(pools, poolColumns, 'Pools Recomendadas')}
            />
          </div>
        </div>

        <div className="flex gap-2 mt-3 flex-wrap items-center">
          <Badge variant="secondary" className="gap-1">
            <Zap className="h-3 w-3" />
            {pools.length} pools encontradas
          </Badge>
          {lastFetched && (
            <span className="text-xs text-muted-foreground">
              Atualizado: {lastFetched.toLocaleTimeString()}
            </span>
          )}
          {networkFilter !== 'all' && (
            <Badge variant="outline" className="cursor-pointer gap-1" onClick={() => setNetworkFilter('all')}>
              {networkFilter} <X className="h-3 w-3" />
            </Badge>
          )}
          {riskFilter !== 'all' && (
            <Badge variant="outline" className="cursor-pointer gap-1" onClick={() => setRiskFilter('all')}>
              Risco: {riskFilter} <X className="h-3 w-3" />
            </Badge>
          )}
        </div>
      </div>

      {/* Profile Info */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Perfil ativo:</span>
          <Badge variant={
            config.profile === 'aggressive' ? 'destructive' :
            config.profile === 'defensive' ? 'secondary' : 'default'
          }>
            {config.profile === 'aggressive' ? 'Agressivo' :
             config.profile === 'defensive' ? 'Defensivo' : 'Normal'}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/scout-settings')}>
          <Filter className="h-4 w-4 mr-1" />
          Ajustar criterios
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <div className="glass-card p-6 text-center border-destructive/50 mb-4">
          <p className="text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={handleRefresh}>
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="glass-card p-4 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      ) : pools.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-medium mb-2">Nenhuma pool encontrada</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {error ? 'Erro ao carregar pools do servidor' : 'Tente ajustar os filtros ou atualizar os dados'}
          </p>
          <Button onClick={handleRefresh} disabled={isFetching}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Buscar pools da API
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pools.map((pool, index) => {
            const gainPercent = gainByPoolId.get(pool.id);
            return (
              <div key={pool.id} className="flex flex-col gap-1">
                <PoolCard
                  pool={pool}
                  capitalSuggested={{
                    percent: Math.min(config.maxPerPool, Math.max(1, Math.ceil(5 - index * 0.5))),
                    usdt: Math.min(config.maxPerPool, Math.max(1, Math.ceil(5 - index * 0.5))) *
                          ((config.totalBanca ?? 0) / 100),
                  }}
                  onViewDetails={() => navigate(`/pools/${pool.chain}/${pool.poolAddress}`)}
                  onFavorite={() => handleFavorite(pool)}
                  onMonitor={() => handleMonitor(pool)}
                  className={cn(
                    index === 0 && 'ring-2 ring-primary/50'
                  )}
                />
                {/* Retorno estimado da recomendação (já deduz IL) */}
                {gainPercent !== undefined && (
                  <div className="flex items-center gap-1 text-xs px-1">
                    <span className="text-muted-foreground">Ret. 7d:</span>
                    <span className={gainPercent >= 0 ? 'text-green-600 dark:text-green-400 font-medium' : 'text-red-500 dark:text-red-400 font-medium'}>
                      {gainPercent >= 0 ? '+' : ''}{gainPercent.toFixed(2)}%
                    </span>
                    <span className="text-muted-foreground text-[10px]">(após IL)</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </MainLayout>
  );
}
