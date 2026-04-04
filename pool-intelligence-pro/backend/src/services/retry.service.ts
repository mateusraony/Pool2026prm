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

// HTTP status codes that should NOT be retried (client errors, not transient)
const NON_RETRYABLE_CODES = [400, 401, 403, 404, 405, 410, 422];

// Check if error is a non-retryable HTTP error
function isNonRetryable(error: Error): boolean {
  const match = error.message.match(/HTTP (\d+)/);
  if (!match) return false;
  return NON_RETRYABLE_CODES.includes(parseInt(match[1], 10));
}

// Check if error is a rate limit (429) — should use longer backoff
function isRateLimited(error: Error): boolean {
  return error.message.includes('HTTP 429');
}

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

      // 404, 401, etc: don't retry, don't count as circuit breaker failure
      if (isNonRetryable(lastError)) {
        break;
      }

      // Record failure only for server/network errors (not client errors)
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

      // 429 rate limit: use longer backoff (start at 5s)
      const baseDelay = isRateLimited(lastError)
        ? Math.max(opts.baseDelayMs, 5000)
        : opts.baseDelayMs;

      // Calculate delay and wait
      const delay = calculateDelay(attempt, baseDelay, opts.maxDelayMs);
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
