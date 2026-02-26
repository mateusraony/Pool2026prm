import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { RangeChart } from '@/components/common/RangeChart';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Star,
  Activity,
  TrendingUp,
  Shield,
  Clock,
  DollarSign,
  BarChart3,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { fetchPoolDetail, addFavorite } from '@/api/client';
import { unifiedPoolToViewPool } from '@/data/adapters';
import { networkColors, dexLogos } from '@/data/constants';
import type { Pool } from '@/types/pool';

export default function ScoutPoolDetail() {
  const { chain, address } = useParams<{ chain: string; address: string }>();
  const navigate = useNavigate();
  const [pool, setPool] = useState<Pool | null>(null);
  const [selectedRange, setSelectedRange] = useState<'defensive' | 'optimized' | 'aggressive'>('optimized');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!chain || !address) return;
    setLoading(true);
    fetchPoolDetail(chain, address)
      .then((data) => {
        if (data) {
          const viewPool = unifiedPoolToViewPool(data.pool, data.score, data.ranges);
          setPool(viewPool);
        }
      })
      .catch(() => toast.error('Erro ao carregar pool'))
      .finally(() => setLoading(false));
  }, [chain, address]);

  if (loading) {
    return (
      <MainLayout title="Carregando..." subtitle="">
        <div className="space-y-4">
          <Skeleton className="h-12 w-1/2" />
          <Skeleton className="h-64 w-full" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!pool) {
    return (
      <MainLayout title="Pool nao encontrada" subtitle="">
        <div className="glass-card p-12 text-center">
          <h3 className="text-xl font-semibold mb-4">Pool nao encontrada</h3>
          <Button onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Button>
        </div>
      </MainLayout>
    );
  }

  const riskLabels = { low: 'Baixo', medium: 'Medio', high: 'Alto' };

  return (
    <MainLayout title={pool.pair} subtitle={`${pool.dex} - ${pool.network}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            if (pool.chain && pool.poolAddress) {
              addFavorite({ poolId: pool.id, chain: pool.chain, poolAddress: pool.poolAddress, token0Symbol: pool.token0, token1Symbol: pool.token1, protocol: pool.protocol });
              toast.success('Pool adicionada a favoritas');
            }
          }}>
            <Star className="h-4 w-4 mr-1" /> Favoritar
          </Button>
          <Button onClick={() => navigate(`/simulation/${pool.chain}/${pool.poolAddress}`)}>
            <Activity className="h-4 w-4 mr-1" /> Simular
          </Button>
        </div>
      </div>

      {/* Pool Info Card */}
      <div className="glass-card p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-secondary text-2xl">
              {dexLogos[pool.dex] || '🔵'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold">{pool.pair}</h2>
                <Badge variant="outline">{pool.feeTier}%</Badge>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-muted-foreground">{pool.dex}</span>
                <span className="text-muted-foreground">·</span>
                <span className="font-medium" style={{ color: networkColors[pool.network] || '#888' }}>
                  {pool.network}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="font-mono text-3xl font-bold text-primary">{pool.score}</span>
            </div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Score IA</span>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="TVL" value={`$${(pool.tvl / 1e6).toFixed(1)}M`} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Volume 24h" value={`$${(pool.volume24h / 1e6).toFixed(1)}M`} icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard label="APR" value={`${pool.apr.toFixed(1)}%`} icon={<TrendingUp className="h-5 w-5" />} variant="success" />
        <StatCard label="Risco" value={riskLabels[pool.risk]} icon={<Shield className="h-5 w-5" />}
          variant={pool.risk === 'low' ? 'success' : pool.risk === 'medium' ? 'warning' : 'danger'} />
      </div>

      {/* Range Tabs */}
      <Tabs value={selectedRange} onValueChange={(v) => setSelectedRange(v as typeof selectedRange)} className="mb-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="defensive">Defensivo</TabsTrigger>
          <TabsTrigger value="optimized">Otimizado</TabsTrigger>
          <TabsTrigger value="aggressive">Agressivo</TabsTrigger>
        </TabsList>
        <TabsContent value={selectedRange}>
          <RangeChart pool={pool} selectedRange={selectedRange} />
        </TabsContent>
      </Tabs>

      {/* Projections */}
      <div className="glass-card p-6 mb-6">
        <h3 className="font-semibold mb-4">Projecoes</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="text-center p-3 rounded-lg bg-secondary/50">
            <p className="stat-label">Fees/dia</p>
            <p className="font-mono text-lg text-success">+{(pool.metrics.feesEstimated * 100).toFixed(3)}%</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-secondary/50">
            <p className="stat-label">IL est.</p>
            <p className="font-mono text-lg text-destructive">-{(pool.metrics.ilEstimated * 100).toFixed(3)}%</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-secondary/50">
            <p className="stat-label">Retorno Liq.</p>
            <p className="font-mono text-lg text-primary">+{(pool.metrics.netReturn * 100).toFixed(3)}%</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-secondary/50">
            <p className="stat-label">Tempo em Range</p>
            <p className="font-mono text-lg">{pool.metrics.timeInRange}%</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-secondary/50">
            <p className="stat-label">Gas est.</p>
            <p className="font-mono text-lg">${pool.metrics.gasEstimated.toFixed(1)}</p>
          </div>
        </div>
      </div>

      {/* Explanation */}
      {pool.explanation && (
        <div className="glass-card p-6">
          <h3 className="font-semibold mb-2">Analise</h3>
          <p className="text-muted-foreground">{pool.explanation}</p>
        </div>
      )}
    </MainLayout>
  );
}
