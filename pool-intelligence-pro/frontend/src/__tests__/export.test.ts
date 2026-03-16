import { describe, it, expect, vi, beforeEach } from 'vitest';
import { poolColumns } from '../lib/export';

// Mock browser APIs not available in jsdom
const mockClick = vi.fn();
const mockAppendChild = vi.fn();
const mockRemoveChild = vi.fn();
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url');
const mockRevokeObjectURL = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // Mock document.createElement to intercept anchor creation
  vi.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild);
  vi.spyOn(document.body, 'removeChild').mockImplementation(mockRemoveChild);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') {
      return { href: '', download: '', click: mockClick } as unknown as HTMLAnchorElement;
    }
    return document.createElement(tag);
  });
  URL.createObjectURL = mockCreateObjectURL;
  URL.revokeObjectURL = mockRevokeObjectURL;
});

describe('poolColumns', () => {
  it('has all required column definitions', () => {
    const headers = poolColumns.map((c) => c.header);
    expect(headers).toContain('Par');
    expect(headers).toContain('DEX');
    expect(headers).toContain('Rede');
    expect(headers).toContain('TVL (USD)');
    expect(headers).toContain('APR (%)');
    expect(headers).toContain('Score');
  });

  it('has expected number of columns defined', () => {
    expect(poolColumns.length).toBeGreaterThanOrEqual(12);
  });

  it('feeTier format adds % suffix', () => {
    const col = poolColumns.find((c) => c.header === 'Fee Tier')!;
    expect(col.format!(0.3, {})).toBe('0.3%');
  });

  it('APR format adds % suffix with 2 decimals', () => {
    const col = poolColumns.find((c) => c.header === 'APR (%)')!;
    expect(col.format!(25.5, {})).toBe('25.50%');
  });

  it('TVL format outputs currency string', () => {
    const col = poolColumns.find((c) => c.header === 'TVL (USD)')!;
    const result = col.format!(1000000, {});
    expect(result).toContain('1,000,000');
  });
});

describe('exportCSV (via poolColumns)', () => {
  it('exportCSV does nothing for empty data', async () => {
    const { exportCSV } = await import('../lib/export');
    exportCSV([], poolColumns, 'test');
    expect(mockClick).not.toHaveBeenCalled();
  });

  it('exportCSV triggers download for non-empty data', async () => {
    const { exportCSV } = await import('../lib/export');
    const data = [
      { pair: 'WETH/USDC', dex: 'Uniswap', network: 'ethereum', feeTier: 0.3, tvl: 1000000, volume24h: 50000, apr: 25, score: 75, risk: 'Médio', metrics: { feesEstimated: 0.001, ilEstimated: 0.002, netReturn: 0.003, timeInRange: 80 } },
    ];
    exportCSV(data, poolColumns, 'pools-export');
    expect(mockClick).toHaveBeenCalledOnce();
    expect(mockCreateObjectURL).toHaveBeenCalledOnce();
  });
});
