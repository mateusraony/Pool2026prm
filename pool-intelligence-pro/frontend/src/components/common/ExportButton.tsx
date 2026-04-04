import { useState } from 'react';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ExportButtonProps {
  onExportCSV: () => void;
  onExportPDF: () => void;
  disabled?: boolean;
  className?: string;
}

export function ExportButton({ onExportCSV, onExportPDF, disabled, className }: ExportButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn('relative', className)}>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className="gap-1.5"
      >
        <Download className="h-4 w-4" />
        Export
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-40 rounded-lg border border-border/50 bg-background/95 backdrop-blur-sm shadow-lg overflow-hidden animate-fade-in">
            <button
              onClick={() => { onExportCSV(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/50 transition-colors"
            >
              <FileSpreadsheet className="h-4 w-4 text-green-400" />
              CSV (Excel)
            </button>
            <button
              onClick={() => { onExportPDF(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/50 transition-colors border-t border-border/20"
            >
              <FileText className="h-4 w-4 text-red-400" />
              PDF (Print)
            </button>
          </div>
        </>
      )}
    </div>
  );
}
