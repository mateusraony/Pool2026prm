# Market Data Integrity Skill

> Rules for validating that market data is real, sourced, and within acceptable ranges.

## Required Fields for Any Pool Display

Every pool shown to the user MUST have:
- `tvl` — numeric, > 0, sourced from adapter (not hardcoded)
- `volume24h` — numeric, >= 0, sourced from adapter
- `chain` — one of: ethereum, arbitrum, base, polygon
- `protocol` — non-empty string
- `token0.symbol` + `token1.symbol` — non-empty

## Acceptable Ranges

| Field | Min | Max | Suspicious If |
|-------|-----|-----|--------------|
| tvl | $1,000 | $50B | > $10B (verify source) |
| volume24h | $0 | tvl * 20 | > tvl * 10 (wash trading flag) |
| fees24h | $0 | volume24h * 0.1 | > volume24h * 0.05 |
| apr | 0% | 500% | > 200% (flag as suspect) |
| price | > 0 | any | = 0 or negative |
| feeTier | 0.0001 | 0.1 | > 0.05 (5% fee unusual) |
| volatilityAnn | 0 | 500% | > 200% (verify) |

## Data Confidence Levels

- **A (High)**: Multiple providers agree (divergence < 5%), data < 5 min old
- **B (Medium)**: Single provider, data < 15 min old, or divergence 5-15%
- **C (Low)**: Stale data (> 30 min), fallback provider, or divergence > 15%
- **D (Unreliable)**: Estimated/synthetic data, no real source

## Anti-Fake-Data Rules

1. NEVER hardcode prices, TVL, volume, or APR values in source code
2. NEVER use `Math.random()` to generate market data (except in tests with clear mock labels)
3. All market data MUST originate from an adapter (DefiLlama, GeckoTerminal, DexScreener, TheGraph)
4. Synthetic data (Monte Carlo, estimated volatility) MUST be labeled as such in the UI
5. When displaying estimated/synthetic data, always show a confidence indicator

## Validation Before Display

```typescript
// Every pool MUST pass this before being shown to user
function isDisplayable(pool: Pool): boolean {
  return (
    pool.tvl > 0 &&
    pool.chain !== '' &&
    pool.token0?.symbol !== '' &&
    pool.token1?.symbol !== '' &&
    !isNaN(pool.tvl) &&
    !isNaN(pool.volume24h)
  );
}
```
