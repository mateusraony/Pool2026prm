import { LogLevel, LogComponent } from '../types/index.js';

interface LogEntry {
  level: LogLevel;
  component: LogComponent;
  message: string;
  data?: unknown;
  timestamp: Date;
}

class LogService {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private dbLogger?: (entry: LogEntry) => Promise<void>;

  setDbLogger(logger: (entry: LogEntry) => Promise<void>) {
    this.dbLogger = logger;
  }

  private log(level: LogLevel, component: LogComponent, message: string, data?: unknown): void {
    const entry: LogEntry = {
      level,
      component,
      message,
      data,
      timestamp: new Date(),
    };

    // Console output
    const prefix = '[' + entry.timestamp.toISOString() + '] [' + level + '] [' + component + ']';
    if (level === 'ERROR' || level === 'CRITICAL') {
      console.error(prefix, message, data || '');
    } else if (level === 'WARN') {
      console.warn(prefix, message, data || '');
    } else {
      console.log(prefix, message, data || '');
    }

    // Store in memory
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Store in DB (async, don't await)
    if (this.dbLogger && (level === 'WARN' || level === 'ERROR' || level === 'CRITICAL')) {
      this.dbLogger(entry).catch(err => console.error('Failed to log to DB:', err));
    }
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
}

export const logService = new LogService();
