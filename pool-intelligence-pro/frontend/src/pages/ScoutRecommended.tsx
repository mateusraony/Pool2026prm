import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { Search, Filter, ArrowUpDown, Zap, RefreshCw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useRiskConfig } from '@/hooks/useRiskConfig';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchUnifiedPools } from '@/api/client';
import { unifiedPoolToViewPool } from '@/data/adapters';
import type { Pool } from '@/types/pool';

export default function ScoutRecommended() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [networkFilter, setNetworkFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'score' | 'apr' | 'tvl' | 'risk'>('score');

  const { config, loading: configLoading } = useRiskConfig();

  const [allPools, setAllPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const loadPools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchUnifiedPools({
        limit: 50,
        sortBy: 'healthScore',
        sortDirection: 'desc',
      });
      const viewPools = res.pools.map((p) => unifiedPoolToViewPool(p));
      setAllPools(viewPools);
      setLastFetched(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao buscar pools';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPools();
  }, [loadPools]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadPools();
    } finally {
      setRefreshing(false);
    }
  };

  // Apply filters and sorting locally
  const pools = useMemo(() => {
    let filtered = [...allPools];

    // Network filter
    if (networkFilter !== 'all') {
      filtered = filtered.filter(
        (p) => p.network.toLowerCase() === networkFilter.toLowerCase()
      );
    }

    // Risk filter
    if (riskFilter !== 'all') {
      filtered = filtered.filter((p) => p.risk === riskFilter);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.pair.toLowerCase().includes(q) ||
          p.dex.toLowerCase().includes(q) ||
          p.network.toLowerCase().includes(q)
      );
    }

    // Sort
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

  const handleFavorite = (poolId: string) => {
    toast.success('Pool adicionada a Lista de Analise');
  };

  const handleMonitor = (pool: Pool) => {
    navigate(`/pools/${pool.chain}/${pool.poolAddress}`);
  };

  const isLoading = loading || configLoading;

  return (
    <MainLayout
      title="Pools Recomendadas"
      subtitle="Melhores oportunidades filtradas com dados reais"
    >
      {/* Filters Bar */}
      <div className="glass-card p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por par, DEX ou rede..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Filters */}
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
                <ArrowUpDown className="h-4 w-4 mr-2" />
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
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Active Filters */}
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
            <Badge
              variant="outline"
              className="cursor-pointer"
              onClick={() => setNetworkFilter('all')}
            >
              {networkFilter} x
            </Badge>
          )}
          {riskFilter !== 'all' && (
            <Badge
              variant="outline"
              className="cursor-pointer"
              onClick={() => setRiskFilter('all')}
            >
              Risco: {riskFilter} x
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
      {isLoading ? (
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
          <Button onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Atualizando...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Buscar pools da API
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pools.map((pool, index) => (
            <PoolCard
              key={pool.id}
              pool={pool}
              capitalSuggested={{
                percent: Math.min(config.maxPerPool, Math.ceil(5 - index * 0.5)),
                usdt: Math.min(config.maxPerPool, Math.ceil(5 - index * 0.5)) *
                      (config.totalBanca / 100),
              }}
              onViewDetails={() => navigate(`/pools/${pool.chain}/${pool.poolAddress}`)}
              onFavorite={() => handleFavorite(pool.id)}
              onMonitor={() => handleMonitor(pool)}
              className={cn(
                index === 0 && 'ring-2 ring-primary/50'
              )}
            />
          ))}
        </div>
      )}
    </MainLayout>
  );
}
