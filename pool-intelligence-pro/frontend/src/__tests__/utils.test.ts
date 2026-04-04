import { describe, it, expect } from 'vitest';
import { cn, formatCurrency, formatPercent } from '../lib/utils';
import {
  scoreToRisk,
  capitalize,
  feeTierToBps,
  feeTierToPercent,
  defaultRiskConfig,
  networkColors,
} from '../data/constants';

describe('cn (class merge utility)', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'extra')).toBe('base extra');
  });

  it('deduplicates tailwind classes correctly', () => {
    // twMerge resolves conflicts: last wins
    const result = cn('text-red-500', 'text-blue-500');
    expect(result).toBe('text-blue-500');
  });
});

describe('formatCurrency', () => {
  it('formats standard currency with 2 decimals', () => {
    expect(formatCurrency(1000)).toBe('$1,000.00');
  });

  it('formats compact currency for large numbers', () => {
    const result = formatCurrency(1_500_000, true);
    expect(result).toContain('1.5');
    expect(result).toContain('M');
  });

  it('handles zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });
});

describe('formatPercent', () => {
  it('formats positive value with + prefix', () => {
    expect(formatPercent(12.5)).toBe('+12.5%');
  });

  it('formats negative value without + prefix', () => {
    expect(formatPercent(-3.2)).toBe('-3.2%');
  });

  it('respects decimals parameter', () => {
    expect(formatPercent(5.678, 2)).toBe('+5.68%');
  });

  it('formats zero as +0.0%', () => {
    expect(formatPercent(0)).toBe('+0.0%');
  });
});

describe('scoreToRisk', () => {
  it('returns low for score >= 75', () => {
    expect(scoreToRisk(75)).toBe('low');
    expect(scoreToRisk(100)).toBe('low');
    expect(scoreToRisk(80)).toBe('low');
  });

  it('returns medium for score 45-74', () => {
    expect(scoreToRisk(45)).toBe('medium');
    expect(scoreToRisk(60)).toBe('medium');
    expect(scoreToRisk(74)).toBe('medium');
  });

  it('returns high for score < 45', () => {
    expect(scoreToRisk(44)).toBe('high');
    expect(scoreToRisk(0)).toBe('high');
  });
});

describe('capitalize', () => {
  it('capitalizes first letter', () => {
    expect(capitalize('ethereum')).toBe('Ethereum');
  });

  it('handles already capitalized string', () => {
    expect(capitalize('Arbitrum')).toBe('Arbitrum');
  });

  it('handles empty string', () => {
    expect(capitalize('')).toBe('');
  });
});

describe('feeTierToBps', () => {
  it('converts fraction (0.003) to bps (3000)', () => {
    expect(feeTierToBps(0.003)).toBe(3000);
  });

  it('returns bps unchanged when > 1', () => {
    expect(feeTierToBps(3000)).toBe(3000);
    expect(feeTierToBps(500)).toBe(500);
  });

  it('defaults to 3000 for falsy values', () => {
    expect(feeTierToBps(undefined)).toBe(3000);
    expect(feeTierToBps(null)).toBe(3000);
    expect(feeTierToBps(0)).toBe(3000);
  });
});

describe('feeTierToPercent', () => {
  it('converts fraction (0.003) to percent (0.3)', () => {
    expect(feeTierToPercent(0.003)).toBeCloseTo(0.3, 5);
  });

  it('converts bps (3000) to percent (0.3)', () => {
    expect(feeTierToPercent(3000)).toBeCloseTo(0.3, 5);
  });

  it('defaults to 0.3 for falsy values', () => {
    expect(feeTierToPercent(undefined)).toBe(0.3);
    expect(feeTierToPercent(0)).toBe(0.3);
  });
});

describe('defaultRiskConfig', () => {
  it('has expected default values', () => {
    expect(defaultRiskConfig.totalBanca).toBe(10000);
    expect(defaultRiskConfig.profile).toBe('normal');
    expect(defaultRiskConfig.excludeMemecoins).toBe(true);
    expect(defaultRiskConfig.allowedNetworks.length).toBeGreaterThan(0);
  });
});

describe('networkColors', () => {
  it('has colors for main chains', () => {
    expect(networkColors['ethereum']).toBe('#627EEA');
    expect(networkColors['arbitrum']).toBe('#28A0F0');
    expect(networkColors['base']).toBe('#0052FF');
    expect(networkColors['polygon']).toBe('#8247E5');
  });
});
