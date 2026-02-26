import { config } from '../config/index.js';
import { logService } from './log.service.js';

interface CircuitState {
  failures: number;
  lastFailure?: Date;
  isOpen: boolean;
  openedAt?: Date;
  closesAt?: Date;
}

class CircuitBreakerService {
  private circuits: Map<string, CircuitState> = new Map();

  private getState(name: string): CircuitState {
    if (!this.circuits.has(name)) {
      this.circuits.set(name, { failures: 0, isOpen: false });
    }
    return this.circuits.get(name)!;
  }

  isOpen(name: string): boolean {
    const state = this.getState(name);
    
    if (!state.isOpen) return false;
    
    // Check if timeout has passed
    if (state.closesAt && new Date() > state.closesAt) {
      this.halfOpen(name);
      return false; // Allow one request through
    }
    
    return true;
  }

  recordSuccess(name: string): void {
    const state = this.getState(name);
    state.failures = 0;
    state.isOpen = false;
    state.openedAt = undefined;
    state.closesAt = undefined;
  }

  recordFailure(name: string): void {
    const state = this.getState(name);
    state.failures++;
    state.lastFailure = new Date();
    
    if (state.failures >= config.circuitBreaker.threshold) {
      this.open(name);
    }
  }

  private open(name: string): void {
    const state = this.getState(name);
    state.isOpen = true;
    state.openedAt = new Date();
    state.closesAt = new Date(Date.now() + config.circuitBreaker.timeout);
    
    logService.warn('PROVIDER', 'Circuit breaker opened for ' + name, {
      failures: state.failures,
      closesAt: state.closesAt,
    });
  }

  private halfOpen(name: string): void {
    const state = this.getState(name);
    state.isOpen = false;
    // Keep failure count - will reset on success or re-open on failure
    
    logService.info('PROVIDER', 'Circuit breaker half-open for ' + name);
  }

  getStatus(name: string): { isOpen: boolean; failures: number; closesAt?: Date } {
    const state = this.getState(name);
    return {
      isOpen: this.isOpen(name),
      failures: state.failures,
      closesAt: state.closesAt,
    };
  }

  getAllStatus(): Record<string, { isOpen: boolean; failures: number }> {
    const result: Record<string, { isOpen: boolean; failures: number }> = {};
    for (const [name, state] of this.circuits) {
      result[name] = {
        isOpen: this.isOpen(name),
        failures: state.failures,
      };
    }
    return result;
  }
}

export const circuitBreaker = new CircuitBreakerService();
