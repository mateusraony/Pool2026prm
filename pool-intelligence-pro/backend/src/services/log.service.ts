import { LogLevel, LogComponent } from '../types/index.js';

interface LogEntry {
  level: LogLevel;
  component: LogComponent;
  message: string;
  data?: unknown;
  timestamp: Date;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  CRITICAL: 4,
};

class LogService {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private dbLogger?: (entry: LogEntry) => Promise<void>;
  private minLevel: LogLevel;
  private jsonOutput: boolean;

  constructor() {
    // Production: INFO+, JSON output. Development: DEBUG+, human-readable
    const isProd = process.env.NODE_ENV === 'production';
    this.minLevel = (process.env.LOG_LEVEL as LogLevel) || (isProd ? 'INFO' : 'DEBUG');
    this.jsonOutput = isProd;
  }

  setDbLogger(logger: (entry: LogEntry) => Promise<void>) {
    this.dbLogger = logger;
  }

  private log(level: LogLevel, component: LogComponent, message: string, data?: unknown): void {
    // Skip if below minimum level
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) return;

    const entry: LogEntry = {
      level,
      component,
      message,
      data,
      timestamp: new Date(),
    };

    // Console output
    if (this.jsonOutput) {
      const json = JSON.stringify({
        ts: entry.timestamp.toISOString(),
        level,
        component,
        msg: message,
        ...(data != null ? { data } : {}),
      });
      if (level === 'ERROR' || level === 'CRITICAL') {
        console.error(json);
      } else {
        console.log(json);
      }
    } else {
      const prefix = '[' + entry.timestamp.toISOString() + '] [' + level + '] [' + component + ']';
      if (level === 'ERROR' || level === 'CRITICAL') {
        console.error(prefix, message, data || '');
      } else if (level === 'WARN') {
        console.warn(prefix, message, data || '');
      } else {
        console.log(prefix, message, data || '');
      }
    }

    // Store in memory (skip DEBUG to reduce noise)
    if (level !== 'DEBUG') {
      this.logs.push(entry);
      if (this.logs.length > this.maxLogs) {
        this.logs.shift();
      }
    }

    // Store in DB (async, don't await)
    if (this.dbLogger && (level === 'WARN' || level === 'ERROR' || level === 'CRITICAL')) {
      this.dbLogger(entry).catch(err => console.error('Failed to log to DB:', err));
    }
  }

  debug(component: LogComponent, message: string, data?: unknown): void {
    this.log('DEBUG', component, message, data);
  }

  info(component: LogComponent, message: string, data?: unknown): void {
    this.log('INFO', component, message, data);
  }

  warn(component: LogComponent, message: string, data?: unknown): void {
    this.log('WARN', component, message, data);
  }

  error(component: LogComponent, message: string, data?: unknown): void {
    this.log('ERROR', component, message, data);
  }

  critical(component: LogComponent, message: string, data?: unknown): void {
    this.log('CRITICAL', component, message, data);
  }

  getRecentLogs(limit = 100, level?: LogLevel, component?: LogComponent): LogEntry[] {
    let filtered = this.logs;

    if (level) {
      filtered = filtered.filter(l => l.level === level);
    }
    if (component) {
      filtered = filtered.filter(l => l.component === component);
    }

    return filtered.slice(-limit).reverse();
  }

  getErrorCount(minutes = 60): number {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.logs.filter(l =>
      (l.level === 'ERROR' || l.level === 'CRITICAL') &&
      l.timestamp > cutoff
    ).length;
  }

  /** Summary of log levels in last N minutes */
  getSummary(minutes = 60): Record<string, number> {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const recent = this.logs.filter(l => l.timestamp > cutoff);
    const summary: Record<string, number> = { INFO: 0, WARN: 0, ERROR: 0, CRITICAL: 0 };
    for (const l of recent) {
      summary[l.level] = (summary[l.level] || 0) + 1;
    }
    return summary;
  }
}

export const logService = new LogService();
