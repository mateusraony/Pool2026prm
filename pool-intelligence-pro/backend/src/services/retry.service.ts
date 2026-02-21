import { logService } from './log.service.js';
import { circuitBreaker } from './circuit-breaker.service.js';
import { LogComponent } from '../types/index.js';

interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  useCircuitBreaker?: boolean;
  circuitName?: string;
  component?: LogComponent;
}

const defaultOptions: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  useCircuitBreaker: true,
  circuitName: 'default',
  component: 'SYSTEM',
};

// Exponential backoff with jitter
function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  
  // Check circuit breaker
  if (opts.useCircuitBreaker && circuitBreaker.isOpen(opts.circuitName)) {
    throw new Error('Circuit breaker is open for ' + opts.circuitName);
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const result = await fn();
      
      // Success - reset circuit breaker
      if (opts.useCircuitBreaker) {
        circuitBreaker.recordSuccess(opts.circuitName);
      }
      
      return result;
    } catch (error) {
      lastError = error as Error;
      
      // Record failure
      if (opts.useCircuitBreaker) {
        circuitBreaker.recordFailure(opts.circuitName);
      }

      // Don't retry if circuit just opened
      if (opts.useCircuitBreaker && circuitBreaker.isOpen(opts.circuitName)) {
        logService.warn(opts.component, 'Circuit breaker opened, stopping retries', {
          circuitName: opts.circuitName,
          error: lastError.message,
        });
        break;
      }

      // Last attempt - don't wait
      if (attempt === opts.maxRetries) {
        break;
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
      logService.warn(opts.component, 'Retry attempt ' + (attempt + 1) + '/' + opts.maxRetries, {
        circuitName: opts.circuitName,
        error: lastError.message,
        delayMs: delay,
      });
      
      await sleep(delay);
    }
  }

  logService.error(opts.component, 'All retry attempts failed', {
    circuitName: opts.circuitName,
    error: lastError?.message,
  });
  
  throw lastError;
}

// Wrapper for provider calls
export async function fetchWithRetry<T>(
  providerName: string,
  fetchFn: () => Promise<T>,
  component: LogComponent = 'PROVIDER'
): Promise<T> {
  return withRetry(fetchFn, {
    circuitName: providerName,
    component,
    maxRetries: 3,
    baseDelayMs: 1000,
  });
}
