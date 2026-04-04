import { describe, it, expect } from 'vitest';
import { ptBR } from '../i18n/pt-br';
import { enUS } from '../i18n/en-us';
import { t } from '../i18n/index';

describe('ptBR translations', () => {
  it('has at least 90 translation keys', () => {
    expect(Object.keys(ptBR).length).toBeGreaterThanOrEqual(90);
  });

  it('has all core navigation keys', () => {
    const navKeys = ['nav.dashboard', 'nav.pools', 'nav.recommended', 'nav.alerts', 'nav.settings'];
    for (const key of navKeys) {
      expect(ptBR[key as keyof typeof ptBR], `missing: ${key}`).toBeTruthy();
    }
  });

  it('no empty string values', () => {
    for (const [key, value] of Object.entries(ptBR)) {
      expect(value.length, `empty value for: ${key}`).toBeGreaterThan(0);
    }
  });
});

describe('enUS translations', () => {
  it('has the same keys as ptBR', () => {
    const ptKeys = Object.keys(ptBR).sort();
    const enKeys = Object.keys(enUS).sort();
    expect(enKeys).toEqual(ptKeys);
  });

  it('no empty string values', () => {
    for (const [key, value] of Object.entries(enUS)) {
      expect(value.length, `empty value for: ${key}`).toBeGreaterThan(0);
    }
  });
});

describe('t() translation function', () => {
  it('translates a known key to pt-BR', () => {
    const result = t('nav.dashboard', 'pt-BR');
    expect(result).toBe('Dashboard');
  });

  it('translates a known key to en-US', () => {
    const result = t('nav.dashboard', 'en-US');
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });

  it('returns key itself for unknown keys', () => {
    const result = t('some.unknown.key.xyz', 'pt-BR');
    expect(result).toBe('some.unknown.key.xyz');
  });
});
