import { useQuery } from '@tanstack/react-query';
import { fetchTokenCorrelation } from '@/api/client';
import { cn } from '@/lib/utils';
import { Loader2, ArrowUpRight, ArrowDownRight, Minus, Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface TokenCorrelationProps {
  chain: string;
  address: string;
}

export function TokenCorrelation({ chain, address }: TokenCorrelationProps) {
  const { data: corr, isLoading } = useQuery({
    queryKey: ['token-correlation', chain, address],
    queryFn: () => fetchTokenCorrelation(chain, address),
    staleTime: 120000,
  });

  if (isLoading) {
    return (
      <div className="glass-card p-4 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!corr) return null;

  const corrAbs = Math.abs(corr.correlation);
  const corrColor = corr.correlation > 0.7 ? 'text-success' :
    corr.correlation > 0.3 ? 'text-primary' :
    corr.correlation > -0.2 ? 'text-warning' : 'text-destructive';

  const pairTypeConfig = {
    stablecoin: { label: 'Stablecoin', color: 'bg-success/10 text-success border-success/20' },
    correlated: { label: 'Correlacionado', color: 'bg-primary/10 text-primary border-primary/20' },
    uncorrelated: { label: 'Descorrelacionado', color: 'bg-warning/10 text-warning border-warning/20' },
    inverse: { label: 'Inverso', color: 'bg-destructive/10 text-destructive border-destructive/20' },
  };
  const ptc = pairTypeConfig[corr.pairType];

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          Correlacao de Tokens
        </h3>
        <Badge variant="outline" className={cn('text-xs', ptc.color)}>{ptc.label}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="rounded-lg bg-secondary/30 p-2 text-center">
          <p className="text-[10px] text-muted-foreground">{corr.token0}</p>
          <p className="font-mono text-sm">{(corr.volToken0 * 100).toFixed(1)}% vol</p>
        </div>
        <div className="rounded-lg bg-secondary/30 p-2 text-center">
          <p className="text-[10px] text-muted-foreground">Correlacao</p>
          <p className={cn('font-mono text-lg font-bold', corrColor)}>
            {corr.correlation >= 0 ? '+' : ''}{corr.correlation}
          </p>
          <p className="text-[10px] text-muted-foreground">{corr.correlationLabel}</p>
        </div>
        <div className="rounded-lg bg-secondary/30 p-2 text-center">
          <p className="text-[10px] text-muted-foreground">{corr.token1}</p>
          <p className="font-mono text-sm">{(corr.volToken1 * 100).toFixed(1)}% vol</p>
        </div>
      </div>

      {/* Correlation bar */}
      <div className="mb-3">
        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
          <span>-1 (Inverso)</span>
          <span>0 (Neutro)</span>
          <span>+1 (Perfeito)</span>
        </div>
        <div className="h-2 rounded-full bg-gradient-to-r from-destructive/40 via-warning/40 to-success/40 relative">
          <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-foreground border-2 border-background shadow-lg"
            style={{ left: `${((corr.correlation + 1) / 2) * 100}%`, transform: 'translate(-50%, -50%)' }} />
        </div>
      </div>

      {/* Impact */}
      <div className="rounded-lg bg-secondary/20 p-3 space-y-2">
        <div className="flex items-start gap-2 text-sm">
          {corr.correlation > 0.5 ? (
            <ArrowDownRight className="h-4 w-4 text-success mt-0.5 shrink-0" />
          ) : corr.correlation > -0.2 ? (
            <Minus className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          ) : (
            <ArrowUpRight className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          )}
          <span className="text-muted-foreground">{corr.ilImpact}</span>
        </div>
        <p className="text-xs text-muted-foreground">{corr.riskAssessment}</p>
      </div>
    </div>
  );
}
