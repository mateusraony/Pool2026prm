import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  icon?: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  className?: string;
}

export function StatCard({
  label,
  value,
  change,
  icon,
  variant = 'default',
  className
}: StatCardProps) {
  const variantStyles = {
    default: 'border-border/40',
    success: 'border-success/30 bg-success/5',
    warning: 'border-warning/30 bg-warning/5',
    danger: 'border-destructive/30 bg-destructive/5',
  };

  const iconBgStyles = {
    default: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-destructive/10 text-destructive',
  };

  const changeColor = change
    ? change > 0
      ? 'text-success'
      : change < 0
        ? 'text-destructive'
        : 'text-muted-foreground'
    : '';

  const TrendIcon = change
    ? change > 0
      ? TrendingUp
      : change < 0
        ? TrendingDown
        : Minus
    : null;

  return (
    <div
      className={cn(
        'glass-card p-5 animate-fade-in group',
        variantStyles[variant],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="stat-label">{label}</p>
          <p className="stat-value mt-1.5">{value}</p>
          {change !== undefined && (
            <div className={cn('flex items-center gap-1.5 mt-2 text-sm', changeColor)}>
              {TrendIcon && <TrendIcon className="h-3.5 w-3.5" />}
              <span className="font-mono text-xs font-medium">{change > 0 ? '+' : ''}{change.toFixed(1)}%</span>
            </div>
          )}
        </div>
        {icon && (
          <div className={cn(
            'flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-300',
            'group-hover:scale-110',
            iconBgStyles[variant]
          )}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
