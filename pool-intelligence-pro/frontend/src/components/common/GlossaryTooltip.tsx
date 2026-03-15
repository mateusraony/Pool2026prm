import { ReactNode } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { defiGlossary } from '@/data/glossary';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GlossaryTooltipProps {
  /** Key do glossário (ex: 'tvl', 'il', 'sharpe') */
  term: string;
  /** Exibir apenas o ícone de ajuda (sem texto) */
  iconOnly?: boolean;
  /** Conteúdo personalizado (substitui o label do glossário) */
  children?: ReactNode;
  /** Modo compacto (tooltip curta) */
  compact?: boolean;
  /** Classes adicionais */
  className?: string;
}

/**
 * Tooltip educacional que mostra explicação de termos DeFi.
 * Usa o glossário centralizado em data/glossary.ts.
 *
 * Uso:
 *   <GlossaryTooltip term="tvl" />                     → mostra "TVL" com tooltip
 *   <GlossaryTooltip term="il" iconOnly />              → só ícone ?
 *   <GlossaryTooltip term="sharpe">Sharpe Ratio</GlossaryTooltip>
 */
export function GlossaryTooltip({ term, iconOnly, children, compact, className }: GlossaryTooltipProps) {
  const entry = defiGlossary[term];
  if (!entry) {
    // Fallback: render children or nothing if term not found
    return <>{children || null}</>;
  }

  const description = compact ? entry.short : entry.full;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn(
            'inline-flex items-center gap-1 cursor-help border-b border-dashed border-muted-foreground/30',
            iconOnly && 'border-0',
            className
          )}>
            {iconOnly ? (
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 hover:text-primary transition-colors" />
            ) : (
              <>
                {children || entry.term}
                <HelpCircle className="h-3 w-3 text-muted-foreground/40" />
              </>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-xs text-sm leading-relaxed"
          sideOffset={5}
        >
          <p className="font-semibold text-xs text-primary mb-1">{entry.term}</p>
          <p>{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
