/**
 * MetricsService — Centralized performance metrics collection.
 * Tracks request durations, error rates, job stats, and system health.
 * All data is in-memory with rolling window cleanup.
 */

interface RequestMetric {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  timestamp: number;
}

interface JobMetric {
  name: string;
  durationMs: number;
  success: boolean;
  timestamp: number;
}

interface EndpointStats {
  count: number;
  avgMs: number;
  p95Ms: number;
  maxMs: number;
  errors: number;
}

class MetricsService {
  private requests: RequestMetric[] = [];
  private jobs: JobMetric[] = [];
  private startTime = Date.now();

  // Rolling window: keep last 60 minutes of data
  private readonly WINDOW_MS = 60 * 60 * 1000;
  private readonly MAX_ENTRIES = 10_000;

  // --- Request Tracking ---

  recordRequest(method: string, path: string, statusCode: number, durationMs: number): void {
    this.requests.push({
      method,
      path: this.normalizePath(path),
      statusCode,
      durationMs,
      timestamp: Date.now(),
    });
    this.maybeCleanup();
  }

  // --- Job Tracking ---

  recordJob(name: string, durationMs: number, success: boolean): void {
    this.jobs.push({
      name,
      durationMs,
      success,
      timestamp: Date.now(),
    });
  }

  /** Helper: wrap a job runner with automatic metrics recording */
  wrapJob(name: string, fn: () => Promise<void>): () => Promise<void> {
    return async () => {
      const start = Date.now();
      let success = true;
      try {
        await fn();
      } catch {
        success = false;
        throw undefined; // re-throw handled by caller
      } finally {
        this.recordJob(name, Date.now() - start, success);
      }
    };
  }

  // --- Queries ---

  getUptime(): { seconds: number; formatted: string } {
    const seconds = Math.floor((Date.now() - this.startTime) / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return {
      seconds,
      formatted: `${h}h ${m}m ${s}s`,
    };
  }

  getMemoryUsage(): { rssBytes: number; heapUsedBytes: number; heapTotalBytes: number; rssMB: number; heapUsedMB: number } {
    const mem = process.memoryUsage();
    return {
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      heapTotalBytes: mem.heapTotal,
      rssMB: Math.round(mem.rss / 1024 / 1024 * 10) / 10,
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024 * 10) / 10,
    };
  }

  getRequestStats(windowMinutes = 60): {
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
    avgDurationMs: number;
    byEndpoint: Record<string, EndpointStats>;
  } {
    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    const recent = this.requests.filter(r => r.timestamp > cutoff);

    const totalRequests = recent.length;
    const totalErrors = recent.filter(r => r.statusCode >= 500).length;
    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;
    const avgDurationMs = totalRequests > 0
      ? Math.round(recent.reduce((s, r) => s + r.durationMs, 0) / totalRequests)
      : 0;

    // Group by endpoint
    const groups = new Map<string, RequestMetric[]>();
    for (const r of recent) {
      const key = `${r.method} ${r.path}`;
      const arr = groups.get(key) || [];
      arr.push(r);
      groups.set(key, arr);
    }

    const byEndpoint: Record<string, EndpointStats> = {};
    for (const [key, metrics] of groups) {
      const durations = metrics.map(m => m.durationMs).sort((a, b) => a - b);
      byEndpoint[key] = {
        count: metrics.length,
        avgMs: Math.round(durations.reduce((s, d) => s + d, 0) / durations.length),
        p95Ms: durations[Math.floor(durations.length * 0.95)] || 0,
        maxMs: durations[durations.length - 1] || 0,
        errors: metrics.filter(m => m.statusCode >= 500).length,
      };
    }

    return { totalRequests, totalErrors, errorRate, avgDurationMs, byEndpoint };
  }

  getJobStats(): Record<string, {
    totalRuns: number;
    successes: number;
    failures: number;
    avgDurationMs: number;
    lastRunAt: string | null;
    lastDurationMs: number | null;
  }> {
    const cutoff = Date.now() - this.WINDOW_MS;
    const recent = this.jobs.filter(j => j.timestamp > cutoff);

    const groups = new Map<string, JobMetric[]>();
    for (const j of recent) {
      const arr = groups.get(j.name) || [];
      arr.push(j);
      groups.set(j.name, arr);
    }

    const result: Record<string, any> = {};
    for (const [name, metrics] of groups) {
      const last = metrics[metrics.length - 1];
      result[name] = {
        totalRuns: metrics.length,
        successes: metrics.filter(m => m.success).length,
        failures: metrics.filter(m => !m.success).length,
        avgDurationMs: Math.round(metrics.reduce((s, m) => s + m.durationMs, 0) / metrics.length),
        lastRunAt: last ? new Date(last.timestamp).toISOString() : null,
        lastDurationMs: last ? last.durationMs : null,
      };
    }

    return result;
  }

  /** Error rate in the last N minutes (for alerting) */
  getErrorRate(windowMinutes = 5): number {
    const cutoff = Date.now() - windowMinutes * 60 * 1000;
    const recent = this.requests.filter(r => r.timestamp > cutoff);
    if (recent.length === 0) return 0;
    return recent.filter(r => r.statusCode >= 500).length / recent.length;
  }

  /** Full snapshot for /api/health */
  getSnapshot(): {
    uptime: ReturnType<MetricsService['getUptime']>;
    memory: ReturnType<MetricsService['getMemoryUsage']>;
    requests: ReturnType<MetricsService['getRequestStats']>;
    jobs: ReturnType<MetricsService['getJobStats']>;
  } {
    return {
      uptime: this.getUptime(),
      memory: this.getMemoryUsage(),
      requests: this.getRequestStats(),
      jobs: this.getJobStats(),
    };
  }

  // --- Internal ---

  /** Normalize dynamic path segments for grouping (e.g. /api/pools/ethereum/0x123 → /api/pools/:chain/:address) */
  private normalizePath(path: string): string {
    return path
      .replace(/\/(ethereum|arbitrum|base|polygon)\//, '/:chain/')
      .replace(/\/0x[a-fA-F0-9]{40}/, '/:address');
  }

  private maybeCleanup(): void {
    if (this.requests.length > this.MAX_ENTRIES) {
      const cutoff = Date.now() - this.WINDOW_MS;
      this.requests = this.requests.filter(r => r.timestamp > cutoff);
      this.jobs = this.jobs.filter(j => j.timestamp > cutoff);
    }
  }
}

export const metricsService = new MetricsService();
