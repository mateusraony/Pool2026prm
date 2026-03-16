import { describe, it, expect } from 'vitest';
import { defiGlossary, getGlossaryEntry, getAllGlossaryEntries } from '../data/glossary';

describe('defiGlossary', () => {
  it('has at least 25 terms', () => {
    expect(Object.keys(defiGlossary).length).toBeGreaterThanOrEqual(25);
  });

  it('every entry has term, short, and full fields', () => {
    for (const [key, entry] of Object.entries(defiGlossary)) {
      expect(entry.term, `${key}.term`).toBeTruthy();
      expect(entry.short, `${key}.short`).toBeTruthy();
      expect(entry.full, `${key}.full`).toBeTruthy();
    }
  });

  it('full descriptions are longer than short ones', () => {
    for (const [key, entry] of Object.entries(defiGlossary)) {
      expect(entry.full.length, `${key} full should be longer than short`).toBeGreaterThan(
        entry.short.length
      );
    }
  });

  it('contains core DeFi terms', () => {
    const requiredKeys = ['tvl', 'apr', 'il', 'sharpe', 'range', 'volatility'];
    for (const key of requiredKeys) {
      expect(defiGlossary[key], `missing key: ${key}`).toBeDefined();
    }
  });
});

describe('getGlossaryEntry', () => {
  it('returns entry for known key', () => {
    const entry = getGlossaryEntry('tvl');
    expect(entry).not.toBeNull();
    expect(entry?.term).toBe('TVL');
  });

  it('returns null for unknown key', () => {
    expect(getGlossaryEntry('unknownXYZ123')).toBeNull();
  });
});

describe('getAllGlossaryEntries', () => {
  it('returns array with key field added', () => {
    const entries = getAllGlossaryEntries();
    expect(entries.length).toBe(Object.keys(defiGlossary).length);
    expect(entries[0]).toHaveProperty('key');
    expect(entries[0]).toHaveProperty('term');
    expect(entries[0]).toHaveProperty('short');
    expect(entries[0]).toHaveProperty('full');
  });
});
