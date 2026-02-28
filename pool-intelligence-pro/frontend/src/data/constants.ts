/**
 * UI constants and default configuration.
 * These replace the hardcoded mock data from pool-scout-pro
 * while keeping the display values for colors, logos, and default risk config.
 */

import type { RiskConfig } from '@/types/pool';

export const defaultRiskConfig: RiskConfig = {
  totalBanca: 10000,
  profile: 'normal',
  maxPerPool: 5,
  maxPerNetwork: 25,
  maxVolatile: 30,
  allowedNetworks: ['Ethereum', 'Arbitrum', 'Optimism', 'Base', 'Polygon'],
  allowedDexs: ['Uniswap V3', 'Velodrome', 'Aerodrome', 'SushiSwap'],
  allowedTokens: ['ETH', 'WBTC', 'USDC', 'USDT', 'DAI', 'OP', 'ARB', 'AERO'],
  excludeMemecoins: true,
};

export const networkColors: Record<string, string> = {
  ethereum: '#627EEA',
  Ethereum: '#627EEA',
  arbitrum: '#28A0F0',
  Arbitrum: '#28A0F0',
  optimism: '#FF0420',
  Optimism: '#FF0420',
  base: '#0052FF',
  Base: '#0052FF',
  polygon: '#8247E5',
  Polygon: '#8247E5',
};

export const dexLogos: Record<string, string> = {
  'Uniswap V3': '🦄',
  'uniswap-v3': '🦄',
  Velodrome: '🚴',
  velodrome: '🚴',
  Aerodrome: '✈️',
  aerodrome: '✈️',
  SushiSwap: '🍣',
  sushiswap: '🍣',
  'Curve': '🔵',
  'curve': '🔵',
};

/**
 * Map a score (0-100) to a risk level.
 */
export function scoreToRisk(score: number): 'low' | 'medium' | 'high' {
  if (score >= 75) return 'low';
  if (score >= 45) return 'medium';
  return 'high';
}

/**
 * Capitalize first letter of a chain/protocol name.
 */
export function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Normalize feeTier to Uniswap basis points (e.g. 3000 for 0.3%).
 * Backend returns fraction (0.003), but value might already be bps (3000).
 * Rule: if feeTier > 1 → already bps; otherwise → fraction × 1_000_000.
 */
export function feeTierToBps(feeTier: number | undefined | null): number {
  if (!feeTier) return 3000;
  if (feeTier > 1) return Math.round(feeTier);
  return Math.round(feeTier * 1_000_000);
}

/**
 * Normalize feeTier to display percentage (e.g. 0.30 for "0.30%").
 * Rule: if feeTier > 1 → bps, divide by 10_000; otherwise → fraction × 100.
 */
export function feeTierToPercent(feeTier: number | undefined | null): number {
  if (!feeTier) return 0.3;
  if (feeTier > 1) return feeTier / 10_000;
  return feeTier * 100;
}
