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
    default: 'border-border',
    success: 'border-success/30 bg-success/5',
    warning: 'border-warning/30 bg-warning/5',
    danger: 'border-destructive/30 bg-destructive/5',
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
        'glass-card p-4 animate-fade-in',
        variantStyles[variant],
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="stat-label">{label}</p>
          <p className="stat-value mt-1">{value}</p>
          {change !== undefined && (
            <div className={cn('flex items-center gap-1 mt-2 text-sm', changeColor)}>
              {TrendIcon && <TrendIcon className="h-3 w-3" />}
              <span className="font-mono">{change > 0 ? '+' : ''}{change}%</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-primary">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
