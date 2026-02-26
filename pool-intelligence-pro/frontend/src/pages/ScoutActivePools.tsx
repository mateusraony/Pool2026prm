import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { StatCard } from '@/components/common/StatCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  DollarSign,
  TrendingUp,
  RefreshCw,
  Plus,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { fetchRangePositions, type RangePosition } from '@/api/client';
import { networkColors } from '@/data/constants';

export default function ScoutActivePools() {
  const navigate = useNavigate();
  const [positions, setPositions] = useState<RangePosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPositions = async () => {
    try {
      const data = await fetchRangePositions();
      setPositions(data.filter((p) => p.isActive));
    } catch {
      toast.error('Erro ao carregar posicoes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPositions(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPositions();
    setRefreshing(false);
    toast.success('Dados atualizados');
  };

  const totalCapital = positions.reduce((sum, p) => sum + p.capital, 0);

  return (
    <MainLayout title="Pools Ativas" subtitle="Posicoes em monitoramento ativo">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Posicoes Ativas" value={positions.length} icon={<Activity className="h-5 w-5" />} />
        <StatCard label="Capital Total" value={`$${totalCapital.toLocaleString()}`} icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Status" value={positions.length > 0 ? 'Monitorando' : 'Sem posicoes'} icon={<TrendingUp className="h-5 w-5" />} variant="success" />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mb-6">
        <Badge variant="secondary">{positions.length} pool{positions.length !== 1 ? 's' : ''} ativa{positions.length !== 1 ? 's' : ''}</Badge>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button size="sm" onClick={() => navigate('/recommended')}>
            <Plus className="h-4 w-4 mr-1" /> Nova Posicao
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="glass-card p-4 space-y-3">
              <Skeleton className="h-8 w-1/2" />
              <div className="grid grid-cols-4 gap-4">
                {[...Array(4)].map((_, j) => <Skeleton key={j} className="h-16" />)}
              </div>
            </div>
          ))}
        </div>
      ) : positions.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Activity className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">Nenhuma pool ativa</h3>
          <p className="text-muted-foreground mb-6">Adicione pools a partir das recomendacoes para comecar a monitorar.</p>
          <Button onClick={() => navigate('/recommended')}>
            <Plus className="h-4 w-4 mr-2" /> Explorar Recomendadas
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {positions.map((pos) => (
            <div key={pos.id} className="glass-card p-4 animate-slide-up">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{pos.token0Symbol}/{pos.token1Symbol}</h3>
                    <Badge variant="outline" className="text-[10px]">{pos.mode}</Badge>
                    <span className="text-xs font-medium" style={{ color: networkColors[pos.chain] || '#888' }}>
                      {pos.chain}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{pos.poolAddress.slice(0, 10)}...{pos.poolAddress.slice(-6)}</p>
                </div>
                <Badge className={cn(pos.isActive ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground')}>
                  {pos.isActive ? 'Ativa' : 'Inativa'}
                </Badge>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-3">
                <div className="rounded-lg bg-secondary/50 p-2 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Capital</p>
                  <p className="font-mono text-sm">${pos.capital}</p>
                </div>
                <div className="rounded-lg bg-secondary/50 p-2 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Range Min</p>
                  <p className="font-mono text-sm">{pos.rangeLower.toFixed(4)}</p>
                </div>
                <div className="rounded-lg bg-secondary/50 p-2 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Range Max</p>
                  <p className="font-mono text-sm">{pos.rangeUpper.toFixed(4)}</p>
                </div>
                <div className="rounded-lg bg-secondary/50 p-2 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Preco Entrada</p>
                  <p className="font-mono text-sm">{pos.entryPrice.toFixed(4)}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1"
                  onClick={() => navigate(`/pools/${pos.chain}/${pos.poolAddress}`)}>
                  Ver Detalhes
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </MainLayout>
  );
}
