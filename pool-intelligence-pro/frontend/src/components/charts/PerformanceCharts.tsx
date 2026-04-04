import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';

interface HistoryPoint {
  timestamp: string;
  price?: number;
  tvl: number;
  volume24h: number;
  fees24h?: number;
}

interface PerformanceChartsProps {
  history: HistoryPoint[];
  className?: string;
}

type ChartTab = 'tvl' | 'volume' | 'fees' | 'price';

const TABS: { key: ChartTab; label: string }[] = [
  { key: 'tvl', label: 'TVL' },
  { key: 'volume', label: 'Volume' },
  { key: 'fees', label: 'Fees' },
  { key: 'price', label: 'Preco' },
];

function formatDate(ts: string): string {
  const d = new Date(ts);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

function formatCompact(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-background/95 backdrop-blur-sm p-3 shadow-lg">
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      {payload.map((item: any, i: number) => (
        <p key={i} className="text-sm font-mono" style={{ color: item.color }}>
          {item.name}: {formatCompact(item.value)}
        </p>
      ))}
    </div>
  );
};

export function PerformanceCharts({ history, className }: PerformanceChartsProps) {
  const [activeTab, setActiveTab] = useState<ChartTab>('tvl');

  const chartData = useMemo(() => {
    if (!history?.length) return [];
    return history.map((h) => ({
      date: formatDate(h.timestamp),
      tvl: h.tvl || 0,
      volume: h.volume24h || 0,
      fees: h.fees24h || 0,
      price: h.price || 0,
    }));
  }, [history]);

  if (!chartData.length) {
    return (
      <div className={cn('glass-card p-6 text-center', className)}>
        <p className="text-sm text-muted-foreground">Sem dados historicos disponiveis</p>
      </div>
    );
  }

  return (
    <div className={cn('glass-card p-6', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Historico de Performance</h3>
        <div className="flex gap-1 bg-secondary/50 rounded-lg p-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-3 py-1 text-xs rounded-md transition-all',
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {activeTab === 'tvl' ? (
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="tvlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="tvl" name="TVL" stroke="hsl(var(--primary))" fill="url(#tvlGrad)" strokeWidth={2} />
            </AreaChart>
          ) : activeTab === 'volume' ? (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="volume" name="Volume 24h" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} opacity={0.8} />
            </BarChart>
          ) : activeTab === 'fees' ? (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="fees" name="Fees 24h" fill="#22c55e" radius={[4, 4, 0, 0]} opacity={0.8} />
            </BarChart>
          ) : (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tickFormatter={formatCompact} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="price" name="Preco" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
