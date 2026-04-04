/**
 * time.service.ts — Fase 5: Timezone e agendamento profissional
 *
 * Utilitários de tempo com suporte a timezone via Intl (sem dependências externas).
 * Padrão: America/Sao_Paulo (UTC-3). Configurável via REPORT_TIMEZONE.
 */

interface TimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * Extrai partes de data/hora em um timezone específico.
 */
function getPartsInTz(date: Date, tz: string): TimeParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = fmt.formatToParts(date);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0');

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24, // Intl pode retornar 24 para meia-noite
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * Verifica se o horário atual no timezone corresponde a hour:minute.
 * Usado por dailyReportJobRunner para agendamento correto.
 */
export function isTimeMatch(hour: number, minute: number, tz: string): boolean {
  const parts = getPartsInTz(new Date(), tz);
  return parts.hour === hour && parts.minute === minute;
}

/**
 * Formata uma data em um timezone específico, no locale pt-BR.
 * Retorna string legível para exibição em mensagens Telegram/UI.
 * Exemplo: "19/03/2026, 18:30"
 */
export function formatDateTz(date: Date, tz: string, locale = 'pt-BR'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Retorna só o horário formatado: "18:30"
 */
export function formatTimeTz(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Retorna a string da data no formato YYYY-MM-DD no timezone especificado.
 * Usado para detecção de "já enviou o relatório hoje?".
 */
export function todayStringTz(tz: string): string {
  const parts = getPartsInTz(new Date(), tz);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
