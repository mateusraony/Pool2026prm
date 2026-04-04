/**
 * Export utilities for CSV and PDF generation.
 * CSV: Pure client-side, no dependencies.
 * PDF: Uses browser print dialog (window.print) for zero-dependency PDF generation.
 */

interface ExportColumn {
  header: string;
  key: string;
  format?: (value: any, row: any) => string;
}

/**
 * Export data as CSV file.
 */
export function exportCSV(
  data: Record<string, any>[],
  columns: ExportColumn[],
  filename: string
) {
  if (!data.length) return;

  const headers = columns.map((c) => c.header);
  const rows = data.map((row) =>
    columns.map((col) => {
      const value = getNestedValue(row, col.key);
      const formatted = col.format ? col.format(value, row) : String(value ?? '');
      // Escape CSV special characters
      if (formatted.includes(',') || formatted.includes('"') || formatted.includes('\n')) {
        return `"${formatted.replace(/"/g, '""')}"`;
      }
      return formatted;
    })
  );

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  downloadFile(csvContent, `${filename}.csv`, 'text/csv;charset=utf-8;');
}

/**
 * Export data as printable HTML report (triggers browser print dialog for PDF).
 */
export function exportPrintReport(
  data: Record<string, any>[],
  columns: ExportColumn[],
  title: string
) {
  if (!data.length) return;

  const rows = data.map((row) =>
    columns.map((col) => {
      const value = getNestedValue(row, col.key);
      return col.format ? col.format(value, row) : String(value ?? '');
    })
  );

  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${title} - Pool Intelligence Pro</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1a1a2e; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .subtitle { font-size: 12px; color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f0f0f5; text-align: left; padding: 8px 10px; border-bottom: 2px solid #ddd; font-weight: 600; }
    td { padding: 6px 10px; border-bottom: 1px solid #eee; }
    tr:nth-child(even) { background: #fafafa; }
    .footer { margin-top: 16px; font-size: 10px; color: #999; text-align: right; }
    @media print { body { padding: 12px; } .no-print { display: none; } }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="subtitle">Pool Intelligence Pro — Gerado em ${new Date().toLocaleString('pt-BR')}</p>
  <table>
    <thead><tr>${columns.map((c) => `<th>${c.header}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>
  <p class="footer">${data.length} registros — Pool Intelligence Pro v3.0</p>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob(['\uFEFF' + content], { type: mimeType }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Pre-defined column sets for common exports
export const poolColumns: ExportColumn[] = [
  { header: 'Par', key: 'pair' },
  { header: 'DEX', key: 'dex' },
  { header: 'Rede', key: 'network' },
  { header: 'Fee Tier', key: 'feeTier', format: (v) => `${v}%` },
  { header: 'TVL (USD)', key: 'tvl', format: (v) => Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) },
  { header: 'Volume 24h (USD)', key: 'volume24h', format: (v) => Number(v).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) },
  { header: 'APR (%)', key: 'apr', format: (v) => `${Number(v).toFixed(2)}%` },
  { header: 'Score', key: 'score' },
  { header: 'Risco', key: 'risk' },
  { header: 'Fees/dia (%)', key: 'metrics.feesEstimated', format: (v) => `${(Number(v) * 100).toFixed(3)}%` },
  { header: 'IL est. (%)', key: 'metrics.ilEstimated', format: (v) => `${(Number(v) * 100).toFixed(3)}%` },
  { header: 'Ret. Liquido (%)', key: 'metrics.netReturn', format: (v) => `${(Number(v) * 100).toFixed(3)}%` },
  { header: 'Tempo em Range (%)', key: 'metrics.timeInRange' },
];
