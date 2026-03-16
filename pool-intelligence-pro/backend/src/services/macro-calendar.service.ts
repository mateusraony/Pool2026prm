import { logService } from './log.service.js';
import { cacheService } from './cache.service.js';

// ============================================================
// Macro Calendar Normalizer Service
// Tracks major macroeconomic events that affect DeFi liquidity
// ============================================================

export interface MacroEvent {
  id: string;
  name: string;
  date: Date;
  type: MacroEventType;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  source: string;
  /** Expected effect on DeFi liquidity: positive = inflow, negative = outflow */
  liquidityEffect: number; // -100 to +100
}

export type MacroEventType =
  | 'FOMC_RATE_DECISION'
  | 'CPI_RELEASE'
  | 'NFP_JOBS'
  | 'GDP_REPORT'
  | 'ETH_UPGRADE'
  | 'TOKEN_UNLOCK'
  | 'REGULATORY'
  | 'OPTIONS_EXPIRY'
  | 'CUSTOM';

interface MacroContext {
  /** Events in the next 7 days */
  upcomingEvents: MacroEvent[];
  /** Overall market risk level based on upcoming events */
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME';
  /** Net expected liquidity effect (-100 to +100) */
  netLiquidityEffect: number;
  /** Human-readable summary */
  summary: string;
}

// Known recurring macro events (static calendar)
const RECURRING_EVENTS: Omit<MacroEvent, 'id' | 'date'>[] = [
  {
    name: 'FOMC Rate Decision',
    type: 'FOMC_RATE_DECISION',
    impact: 'HIGH',
    description: 'Federal Reserve interest rate decision — major volatility expected',
    source: 'Federal Reserve',
    liquidityEffect: -20,
  },
  {
    name: 'US CPI Release',
    type: 'CPI_RELEASE',
    impact: 'HIGH',
    description: 'Consumer Price Index release — inflation data affects risk appetite',
    source: 'BLS',
    liquidityEffect: -15,
  },
  {
    name: 'Non-Farm Payrolls',
    type: 'NFP_JOBS',
    impact: 'MEDIUM',
    description: 'Monthly US employment report',
    source: 'BLS',
    liquidityEffect: -10,
  },
  {
    name: 'Quarterly Options Expiry',
    type: 'OPTIONS_EXPIRY',
    impact: 'HIGH',
    description: 'Quarterly crypto options/futures expiry — high volatility expected',
    source: 'Deribit/CME',
    liquidityEffect: -25,
  },
];

class MacroCalendarService {
  private customEvents: MacroEvent[] = [];

  /**
   * Add a custom macro event (token unlock, upgrade, regulatory deadline, etc.)
   */
  addEvent(event: Omit<MacroEvent, 'id'>): MacroEvent {
    const fullEvent: MacroEvent = {
      ...event,
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };
    this.customEvents.push(fullEvent);
    logService.info('SYSTEM', 'Macro event added', { name: fullEvent.name, date: fullEvent.date });
    return fullEvent;
  }

  /**
   * Remove a custom event
   */
  removeEvent(id: string): boolean {
    const idx = this.customEvents.findIndex(e => e.id === id);
    if (idx >= 0) {
      this.customEvents.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all upcoming events within the next N days
   */
  getUpcomingEvents(daysAhead: number = 7): MacroEvent[] {
    const cached = cacheService.get<MacroEvent[]>('macro_events');
    if (cached.data) return cached.data;

    const now = new Date();
    const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    // Merge recurring (projected) + custom events
    const projected = this.projectRecurringEvents(now, cutoff);
    const custom = this.customEvents.filter(e => e.date >= now && e.date <= cutoff);

    const all = [...projected, ...custom].sort((a, b) => a.date.getTime() - b.date.getTime());

    cacheService.set('macro_events', all, 3600); // Cache 1h
    return all;
  }

  /**
   * Get macro context for risk assessment
   * This is consumed by the score engine and recommendation service
   */
  getMacroContext(): MacroContext {
    const events = this.getUpcomingEvents(7);
    const netEffect = events.reduce((sum, e) => sum + e.liquidityEffect, 0);
    const highImpactCount = events.filter(e => e.impact === 'HIGH').length;

    let riskLevel: MacroContext['riskLevel'] = 'LOW';
    if (highImpactCount >= 3 || netEffect < -50) riskLevel = 'EXTREME';
    else if (highImpactCount >= 2 || netEffect < -30) riskLevel = 'HIGH';
    else if (highImpactCount >= 1 || netEffect < -15) riskLevel = 'MODERATE';

    const summary = this.buildSummary(events, riskLevel, netEffect);

    return {
      upcomingEvents: events,
      riskLevel,
      netLiquidityEffect: Math.max(-100, Math.min(100, netEffect)),
      summary,
    };
  }

  /**
   * Get all custom events (for API/CRUD)
   */
  getCustomEvents(): MacroEvent[] {
    return [...this.customEvents];
  }

  /**
   * Project known recurring events into the future window
   * Note: This is approximate — real dates come from external calendars
   */
  private projectRecurringEvents(from: Date, to: Date): MacroEvent[] {
    const events: MacroEvent[] = [];

    // FOMC: ~8 meetings per year (roughly every 6 weeks)
    // CPI: Monthly, usually 2nd week
    // NFP: First Friday of each month
    // Options expiry: Last Friday of March, June, September, December

    const year = from.getFullYear();
    const month = from.getMonth();

    // Project next 3 months of events
    for (let m = month; m <= month + 3; m++) {
      const actualMonth = m % 12;
      const actualYear = year + Math.floor(m / 12);

      // NFP: First Friday of month
      const firstDay = new Date(actualYear, actualMonth, 1);
      const firstFriday = new Date(firstDay);
      firstFriday.setDate(1 + ((5 - firstDay.getDay() + 7) % 7));
      if (firstFriday >= from && firstFriday <= to) {
        events.push({
          ...RECURRING_EVENTS[2], // NFP
          id: `nfp_${actualYear}_${actualMonth}`,
          date: firstFriday,
        });
      }

      // CPI: ~12th-15th of each month
      const cpiDate = new Date(actualYear, actualMonth, 13);
      if (cpiDate >= from && cpiDate <= to) {
        events.push({
          ...RECURRING_EVENTS[1], // CPI
          id: `cpi_${actualYear}_${actualMonth}`,
          date: cpiDate,
        });
      }

      // Quarterly Options Expiry: Last Friday of March, June, Sept, Dec
      if ([2, 5, 8, 11].includes(actualMonth)) {
        const lastDay = new Date(actualYear, actualMonth + 1, 0);
        const lastFriday = new Date(lastDay);
        lastFriday.setDate(lastDay.getDate() - ((lastDay.getDay() + 2) % 7));
        if (lastFriday >= from && lastFriday <= to) {
          events.push({
            ...RECURRING_EVENTS[3], // Options expiry
            id: `expiry_${actualYear}_${actualMonth}`,
            date: lastFriday,
          });
        }
      }
    }

    // FOMC: Approximate schedule (~every 6 weeks)
    // Simplified: check 2nd/3rd Wednesday of Jan, Mar, May, Jun, Jul, Sep, Nov, Dec
    const fomcMonths = [0, 2, 4, 5, 6, 8, 10, 11];
    for (const fm of fomcMonths) {
      const fomcDate = new Date(year, fm, 15 + ((3 - new Date(year, fm, 15).getDay() + 7) % 7));
      if (fomcDate >= from && fomcDate <= to) {
        events.push({
          ...RECURRING_EVENTS[0], // FOMC
          id: `fomc_${year}_${fm}`,
          date: fomcDate,
        });
      }
    }

    return events;
  }

  private buildSummary(events: MacroEvent[], riskLevel: string, netEffect: number): string {
    if (events.length === 0) {
      return 'Sem eventos macro relevantes nos próximos 7 dias. Liquidez estável esperada.';
    }

    const highEvents = events.filter(e => e.impact === 'HIGH');
    const effectWord = netEffect < 0 ? 'negativo' : 'positivo';

    let summary = `${events.length} evento(s) macro nos próximos 7 dias`;
    if (highEvents.length > 0) {
      summary += ` (${highEvents.length} de alto impacto: ${highEvents.map(e => e.name).join(', ')})`;
    }
    summary += `. Risco macro: ${riskLevel}. Efeito líquido na liquidez: ${effectWord} (${netEffect > 0 ? '+' : ''}${netEffect}).`;

    return summary;
  }
}

export const macroCalendarService = new MacroCalendarService();
