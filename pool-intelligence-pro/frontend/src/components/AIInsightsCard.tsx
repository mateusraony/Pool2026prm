/**
 * AIInsightsCard — ETAPA 17
 * Exibe análise AI de uma pool em linguagem natural.
 */

import { useQuery } from '@tanstack/react-query';
import { Sparkles, AlertTriangle, TrendingUp, RefreshCw, Brain } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/api/client';

interface PoolInsight {
  summary: string;
  recommendation: string;
  keyRisks: string[];
  opportunities: string[];
  confidence: 'high' | 'medium' | 'low';
  generatedBy: 'claude' | 'rule-based';
  generatedAt: string;
}

interface AIInsightsCardProps {
  chain: string;
  address: string;
}

async function fetchInsights(chain: string, address: string): Promise<PoolInsight> {
  const res = await apiClient.get<{ success: boolean; data: PoolInsight }>(
    `/pools/${chain}/${address}/insights`
  );
  return res.data.data;
}

const CONFIDENCE_COLORS = {
  high: 'bg-green-500/10 text-green-400 border-green-500/30',
  medium: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  low: 'bg-red-500/10 text-red-400 border-red-500/30',
};

const CONFIDENCE_LABELS = {
  high: 'Alta confiança',
  medium: 'Confiança moderada',
  low: 'Baixa confiança',
};

export function AIInsightsCard({ chain, address }: AIInsightsCardProps) {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['ai-insights', chain, address],
    queryFn: () => fetchInsights(chain, address),
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
            Gerando análise AI...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-4 bg-muted/50 rounded animate-pulse" style={{ width: `${70 + i * 10}%` }} />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Brain className="h-4 w-4 text-muted-foreground" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Análise disponível após o próximo ciclo do radar.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            {data.generatedBy === 'claude'
              ? <Sparkles className="h-4 w-4 text-primary" />
              : <Brain className="h-4 w-4 text-muted-foreground" />
            }
            AI Insights
            {data.generatedBy === 'claude' && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 border-primary/30 text-primary">
                Claude
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${CONFIDENCE_COLORS[data.confidence]}`}>
              {CONFIDENCE_LABELS[data.confidence]}
            </Badge>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>

        {/* Recommendation */}
        <div className="rounded-md bg-muted/30 border border-border/50 p-3">
          <p className="text-sm leading-relaxed">{data.recommendation}</p>
        </div>

        {/* Risks */}
        {data.keyRisks.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-xs font-medium text-yellow-400">Riscos</span>
            </div>
            <ul className="space-y-1">
              {data.keyRisks.map((risk, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-yellow-400/60 mt-0.5">•</span>
                  {risk}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Opportunities */}
        {data.opportunities.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="h-3.5 w-3.5 text-green-400" />
              <span className="text-xs font-medium text-green-400">Oportunidades</span>
            </div>
            <ul className="space-y-1">
              {data.opportunities.map((opp, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-green-400/60 mt-0.5">•</span>
                  {opp}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground/50 text-right">
          {new Date(data.generatedAt).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </CardContent>
    </Card>
  );
}
