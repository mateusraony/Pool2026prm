import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Search,
  Plus,
  X,
  TrendingUp,
  ArrowRight,
  Trophy,
  Eye,
} from 'lucide-react';
import { cn, formatCurrency, formatPercent } from '@/lib/utils';
import { fetchUnifiedPools } from '@/api/client';
import { unifiedPoolToViewPool } from '@/data/adapters';
import { networkColors, dexLogos } from '@/data/constants';
import { ExportButton } from '@/components/common/ExportButton';
import { exportCSV, exportPrintReport, poolColumns } from '@/lib/export';
import type { Pool } from '@/types/pool';

const MAX_COMPARE = 4;

function getScoreColor(score: number) {
  if (score >= 70) return 'text-green-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function getBestClass(values: number[], index: number, higher = true) {
  if (values.length < 2) return '';
  const best = higher ? Math.max(...values) : Math.min(...values);
  return values[index] === best ? 'text-primary font-bold' : '';
}

interface MetricRowProps {
  label: string;
  values: (string | number)[];
  rawValues?: number[];
  higherIsBetter?: boolean;
}

function MetricRow({ label, values, rawValues, higherIsBetter = true }: MetricRowProps) {
  return (
    <div className="grid items-center border-b border-border/30 last:border-0" style={{ gridTemplateColumns: `180px repeat(${values.length}, 1fr)` }}>
      <div className="py-2.5 px-3 text-xs text-muted-foreground font-display uppercase tracking-wider">
        {label}
      </div>
      {values.map((v, i) => (
        <div
          key={i}
          className={cn(
            'py-2.5 px-3 text-sm font-mono text-center',
            rawValues ? getBestClass(rawValues, i, higherIsBetter) : ''
          )}
        >
          {v}
        </div>
      ))}
    </div>
  );
}

export default function PoolCompare() {
  const navigate = useNavigate();
  const [selectedPools, setSelectedPools] = useState<Pool[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const { data: poolsData, isLoading } = useQuery({
    queryKey: ['all-pools-compare'],
    queryFn: () => fetchUnifiedPools({ limit: 100, sortBy: 'healthScore', sortDirection: 'desc' }),
    staleTime: 60000,
  });

  const allPools = useMemo(() => {
    if (!poolsData?.pools) return [];
    return poolsData.pools.map((p) => unifiedPoolToViewPool(p));
  }, [poolsData]);

  const filteredPools = useMemo(() => {
    if (!searchQuery.trim()) return allPools.slice(0, 20);
    const q = searchQuery.toLowerCase();
    return allPools.filter(
      (p) =>
        p.pair.toLowerCase().includes(q) ||
        p.dex.toLowerCase().includes(q) ||
        p.network.toLowerCase().includes(q) ||
        p.token0.toLowerCase().includes(q) ||
        p.token1.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [allPools, searchQuery]);

  const addPool = (pool: Pool) => {
    if (selectedPools.length >= MAX_COMPARE) return;
    if (selectedPools.find((p) => p.id === pool.id)) return;
    setSelectedPools((prev) => [...prev, pool]);
    setShowSearch(false);
    setSearchQuery('');
  };

  const removePool = (poolId: string) => {
    setSelectedPools((prev) => prev.filter((p) => p.id !== poolId));
  };

  const pools = selectedPools;

  return (
    <MainLayout
      title="Comparador de Pools"
      subtitle="Compare ate 4 pools side-by-side"
    >
      {/* Pool selector area */}
      <div className="glass-card p-4 mb-6">
        <div className="flex items-center gap-3 flex-wrap">
          {pools.map((pool) => (
            <div
              key={pool.id}
              className="flex items-center gap-2 bg-secondary/60 rounded-lg px-3 py-1.5 ring-1 ring-border/30"
            >
              <span className="text-sm">{dexLogos[pool.dex] || '🔵'}</span>
              <span className="text-sm font-medium">{pool.pair}</span>
              <span className="text-xs text-muted-foreground">{pool.network}</span>
              <button
                onClick={() => removePool(pool.id)}
                className="ml-1 p-0.5 rounded hover:bg-destructive/20 transition-colors"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}

          {pools.length < MAX_COMPARE && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSearch(true)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Adicionar pool ({pools.length}/{MAX_COMPARE})
            </Button>
          )}

          {pools.length >= 2 && (
            <ExportButton
              onExportCSV={() => exportCSV(pools, poolColumns, `comparacao-pools-${new Date().toISOString().slice(0, 10)}`)}
              onExportPDF={() => exportPrintReport(pools, poolColumns, 'Comparacao de Pools')}
            />
          )}
        </div>

        {/* Search dropdown */}
        {showSearch && (
          <div className="mt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por par, DEX ou rede..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                autoFocus
              />
              <button
                onClick={() => { setShowSearch(false); setSearchQuery(''); }}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            </div>

            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border/50 bg-background/95 backdrop-blur-sm">
              {isLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Carregando pools...</div>
              ) : filteredPools.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Nenhuma pool encontrada</div>
              ) : (
                filteredPools.map((pool) => {
                  const isSelected = selectedPools.some((p) => p.id === pool.id);
                  return (
                    <button
                      key={pool.id}
                      onClick={() => !isSelected && addPool(pool)}
                      disabled={isSelected}
                      className={cn(
                        'w-full flex items-center justify-between px-4 py-2.5 hover:bg-secondary/50 transition-colors text-left border-b border-border/20 last:border-0',
                        isSelected && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span>{dexLogos[pool.dex] || '🔵'}</span>
                        <div>
                          <span className="text-sm font-medium">{pool.pair}</span>
                          <span className="text-xs text-muted-foreground ml-2">{pool.dex} · {pool.network}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={cn('font-mono text-sm font-bold', getScoreColor(pool.score))}>{pool.score}</span>
                        <span className="text-xs text-muted-foreground">{formatCurrency(pool.tvl, true)}</span>
                        {!isSelected && <Plus className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Comparison table */}
      {pools.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <Trophy className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-medium mb-2">Selecione pools para comparar</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Adicione ate 4 pools para ver uma comparacao detalhada side-by-side
          </p>
          <Button onClick={() => setShowSearch(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar primeira pool
          </Button>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          {/* Headers */}
          <div
            className="grid border-b border-border/50"
            style={{ gridTemplateColumns: `180px repeat(${pools.length}, 1fr)` }}
          >
            <div className="p-3" />
            {pools.map((pool) => (
              <div key={pool.id} className="p-3 text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span>{dexLogos[pool.dex] || '🔵'}</span>
                  <span className="font-display font-semibold text-sm">{pool.pair}</span>
                </div>
                <div className="flex items-center justify-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{pool.dex}</span>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="text-xs" style={{ color: networkColors[pool.network] || '#888' }}>{pool.network}</span>
                </div>
                <div className="flex items-center justify-center gap-3 mt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => navigate(`/pools/${pool.chain}/${pool.poolAddress}`)}
                  >
                    <Eye className="h-3 w-3 mr-1" />
                    Detalhes
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Score section */}
          <div className="bg-secondary/20">
            <div
              className="grid border-b border-border/30"
              style={{ gridTemplateColumns: `180px repeat(${pools.length}, 1fr)` }}
            >
              <div className="py-2 px-3 text-xs font-display font-bold uppercase tracking-wider text-primary">
                Score & Risco
              </div>
              {pools.map(() => <div key={Math.random()} />)}
            </div>
          </div>
          <MetricRow
            label="Score IA"
            values={pools.map((p) => p.score)}
            rawValues={pools.map((p) => p.score)}
          />
          <MetricRow
            label="Risco"
            values={pools.map((p) => p.risk === 'low' ? 'Baixo' : p.risk === 'medium' ? 'Medio' : 'Alto')}
          />
          <MetricRow
            label="Fee Tier"
            values={pools.map((p) => `${p.feeTier}%`)}
          />

          {/* Liquidity section */}
          <div className="bg-secondary/20">
            <div
              className="grid border-b border-border/30"
              style={{ gridTemplateColumns: `180px repeat(${pools.length}, 1fr)` }}
            >
              <div className="py-2 px-3 text-xs font-display font-bold uppercase tracking-wider text-primary">
                Liquidez
              </div>
              {pools.map(() => <div key={Math.random()} />)}
            </div>
          </div>
          <MetricRow
            label="TVL"
            values={pools.map((p) => formatCurrency(p.tvl, true))}
            rawValues={pools.map((p) => p.tvl)}
          />
          <MetricRow
            label="Volume 24h"
            values={pools.map((p) => formatCurrency(p.volume24h, true))}
            rawValues={pools.map((p) => p.volume24h)}
          />
          <MetricRow
            label="Volume 7d"
            values={pools.map((p) => formatCurrency(p.volume7d, true))}
            rawValues={pools.map((p) => p.volume7d)}
          />

          {/* Returns section */}
          <div className="bg-secondary/20">
            <div
              className="grid border-b border-border/30"
              style={{ gridTemplateColumns: `180px repeat(${pools.length}, 1fr)` }}
            >
              <div className="py-2 px-3 text-xs font-display font-bold uppercase tracking-wider text-primary">
                Retornos
              </div>
              {pools.map(() => <div key={Math.random()} />)}
            </div>
          </div>
          <MetricRow
            label="APR"
            values={pools.map((p) => `${p.apr.toFixed(1)}%`)}
            rawValues={pools.map((p) => p.apr)}
          />
          <MetricRow
            label="Fees/dia"
            values={pools.map((p) => formatPercent(p.metrics.feesEstimated * 100))}
            rawValues={pools.map((p) => p.metrics.feesEstimated)}
          />
          <MetricRow
            label="IL estimado"
            values={pools.map((p) => `-${(p.metrics.ilEstimated * 100).toFixed(2)}%`)}
            rawValues={pools.map((p) => p.metrics.ilEstimated)}
            higherIsBetter={false}
          />
          <MetricRow
            label="Ret. Liquido"
            values={pools.map((p) => formatPercent(p.metrics.netReturn * 100))}
            rawValues={pools.map((p) => p.metrics.netReturn)}
          />

          {/* Ranges section */}
          <div className="bg-secondary/20">
            <div
              className="grid border-b border-border/30"
              style={{ gridTemplateColumns: `180px repeat(${pools.length}, 1fr)` }}
            >
              <div className="py-2 px-3 text-xs font-display font-bold uppercase tracking-wider text-primary">
                Ranges
              </div>
              {pools.map(() => <div key={Math.random()} />)}
            </div>
          </div>
          <MetricRow
            label="Preco Atual"
            values={pools.map((p) => formatCurrency(p.currentPrice))}
          />
          <MetricRow
            label="Range Defensivo"
            values={pools.map((p) => `${formatCurrency(p.ranges.defensive.min)} - ${formatCurrency(p.ranges.defensive.max)}`)}
          />
          <MetricRow
            label="Range Otimizado"
            values={pools.map((p) => `${formatCurrency(p.ranges.optimized.min)} - ${formatCurrency(p.ranges.optimized.max)}`)}
          />
          <MetricRow
            label="Tempo no Range"
            values={pools.map((p) => `${p.metrics.timeInRange}%`)}
            rawValues={pools.map((p) => p.metrics.timeInRange)}
          />

          {/* Operational section */}
          <div className="bg-secondary/20">
            <div
              className="grid border-b border-border/30"
              style={{ gridTemplateColumns: `180px repeat(${pools.length}, 1fr)` }}
            >
              <div className="py-2 px-3 text-xs font-display font-bold uppercase tracking-wider text-primary">
                Operacional
              </div>
              {pools.map(() => <div key={Math.random()} />)}
            </div>
          </div>
          <MetricRow
            label="Gas estimado"
            values={pools.map((p) => `$${p.metrics.gasEstimated.toFixed(1)}`)}
            rawValues={pools.map((p) => p.metrics.gasEstimated)}
            higherIsBetter={false}
          />

          {/* Verdict row */}
          <div className="bg-primary/5 border-t border-primary/20">
            <div
              className="grid"
              style={{ gridTemplateColumns: `180px repeat(${pools.length}, 1fr)` }}
            >
              <div className="py-3 px-3 text-xs font-display font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                <Trophy className="h-3.5 w-3.5" />
                Veredicto
              </div>
              {pools.map((pool, i) => {
                const bestScore = Math.max(...pools.map((p) => p.score));
                const isBest = pool.score === bestScore && pools.length > 1;
                return (
                  <div key={pool.id} className="py-3 px-3 text-center">
                    {isBest ? (
                      <Badge className="bg-primary/20 text-primary border-primary/30">
                        <Trophy className="h-3 w-3 mr-1" />
                        Melhor opcao
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {pool.score - bestScore} pts vs melhor
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
