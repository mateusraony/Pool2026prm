import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { fetchPoolMetricsHistory } from '@/api/client';

interface Props {
  chain: string;
  address: string;
}

export function PoolMetricsChart({ chain, address }: Props) {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ['pool-metrics-history', chain, address],
    queryFn: () => fetchPoolMetricsHistory(chain, address),
    refetchInterval: 300_000, // 5min
  });

  if (isLoading) return <div className="h-40 bg-dark-700 rounded animate-pulse" />;

  if (history.length < 2) {
    return (
      <div className="h-40 flex items-center justify-center text-muted-foreground text-sm rounded-lg border border-dark-700">
        <span>Histórico disponível após 2+ atualizações do radar</span>
      </div>
    );
  }

  const formatted = history.map(p => ({
    time: new Date(p.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    TVL: Math.round(p.tvl / 1000), // em K$
    APR: Math.round(p.apr * 10) / 10,
    Score: p.score != null ? Math.round(p.score * 10) / 10 : null,
  }));

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground px-1">Histórico ({history.length} snapshots)</div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={formatted} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: '#12121a', border: '1px solid #1a1a24', borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="APR" stroke="#10b981" strokeWidth={1.5} dot={false} name="APR %" />
          <Line type="monotone" dataKey="Score" stroke="#6366f1" strokeWidth={1.5} dot={false} name="Score" />
          <Line type="monotone" dataKey="TVL" stroke="#f59e0b" strokeWidth={1} dot={false} name="TVL (K$)" strokeDasharray="3 3" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
