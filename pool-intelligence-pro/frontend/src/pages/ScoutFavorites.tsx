import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { Star, Eye, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { fetchFavorites, removeFavorite, type FavoritePool } from '@/api/client';
import { networkColors, dexLogos } from '@/data/constants';

export default function ScoutFavorites() {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<FavoritePool[]>([]);
  const [loading, setLoading] = useState(true);

  const loadFavorites = async () => {
    try {
      setLoading(true);
      const data = await fetchFavorites();
      setFavorites(data);
    } catch {
      toast.error('Erro ao carregar favoritas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadFavorites(); }, []);

  const handleRemove = async (poolId: string) => {
    try {
      await removeFavorite(poolId);
      setFavorites((prev) => prev.filter((f) => f.poolId !== poolId));
      toast.success('Pool removida das favoritas');
    } catch {
      toast.error('Erro ao remover');
    }
  };

  return (
    <MainLayout title="Favoritas" subtitle="Pools marcadas para acompanhamento">
      <div className="flex items-center justify-between mb-6">
        <Badge variant="secondary">{favorites.length} pool{favorites.length !== 1 ? 's' : ''}</Badge>
        <Button variant="outline" size="sm" onClick={loadFavorites}>
          <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="glass-card p-4 space-y-3">
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      ) : favorites.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Star className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">Nenhuma pool favoritada</h3>
          <p className="text-muted-foreground mb-6">Adicione pools as favoritas para acompanhar de perto.</p>
          <Button onClick={() => navigate('/recommended')}>Explorar Recomendadas</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {favorites.map((fav) => (
            <div key={fav.id} className="glass-card p-4 animate-slide-up">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-xl">
                    {dexLogos[fav.protocol] || '🔵'}
                  </div>
                  <div>
                    <h3 className="font-semibold">{fav.token0Symbol}/{fav.token1Symbol}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{fav.protocol}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-xs font-medium" style={{ color: networkColors[fav.chain] || '#888' }}>
                        {fav.chain}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/pools/${fav.chain}/${fav.poolAddress}`)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleRemove(fav.poolId)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </MainLayout>
  );
}
