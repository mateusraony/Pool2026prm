# Design Spec: Revert Finance–Inspired Features
**Date:** 2026-04-07  
**Status:** Approved by user  
**Branch:** `claude/fix-render-deploy-P1001-v2`

---

## Overview

Six features inspired by analysis of [Revert Finance](https://github.com/revert-finance), adapted for our off-chain intelligence context. No smart contracts. No on-chain execution. Everything is analysis, simulation, and UI.

---

## Feature 1 — Auto-Compound ROI Calculator

### Purpose
Show users the optimal compounding schedule for their LP fees — inspired by Revert's `compoundor-js` bot logic but expressed as analysis rather than automation.

### Location
- Widget in `Simulation.tsx` (below the 7-day projection card)
- Widget in `ScoutPoolDetail.tsx` (new "Compound Strategy" section)

### Backend
**New function in `calc.service.ts`:** `calcAutoCompound(params)`

```typescript
interface AutoCompoundParams {
  capital: number;        // USD
  apr: number;            // annual % (e.g. 42 for 42%)
  timeInRangePct: number; // 0-100
  gasEstimate: number;    // USD per compound transaction
  chain: string;          // for gas lookup
  daysElapsed?: number;   // days since position opened (for accrued fees)
}

interface AutoCompoundResult {
  dailyFees: number;          // USD/day
  feesAccruedEstimate: number; // USD if daysElapsed provided
  breakEvenDays: number;       // days until fees > gas cost
  optimalFrequencyDays: number;// sqrt(2 * gas / dailyFees) — optimal interval
  aprSimple: number;           // APR without compounding
  aprCompounded: number;       // APR with optimal compounding (APY)
  aprBoostPct: number;         // difference
  shouldCompoundNow: boolean;  // feesAccrued >= gas * 3
  nextCompoundIn: number;      // days until next optimal compound
}
```

**Formula:**
```
dailyFees = (apr/100/365) * capital * (timeInRange/100)
optimalFrequencyDays = sqrt(2 * gasEstimate / dailyFees)
aprCompounded = (1 + dailyFees/capital)^365 - 1
aprBoost = aprCompounded - aprSimple
shouldCompound = feesAccrued >= gasEstimate * 3
```

**New endpoint:** `POST /api/calc/auto-compound`

### Frontend UI
Card with:
- Daily fee accrual rate: `~$X/day`
- Compound frequency: `Optimal: every N days`
- APR boost: `+Z% with compounding (APY: W%)`
- Progress bar: fees accrued / threshold to compound
- CTA badge: `✅ Ready to compound` or `⏳ Compound in N days`

---

## Feature 2 — AutoRange Buffer Zone (Tick-Based Alert Buffer)

### Purpose
Reduce false-positive range alerts. Inspired by Revert's `AutoRange.sol` `lowerTickLimit`/`upperTickLimit` — a buffer zone before alerting.

### Location
- `alert.service.ts` — alert trigger logic
- `ScoutPoolDetail.tsx` — visual buffer zone in range chart
- `ScoutActivePools.tsx` — status badge update

### Backend Logic Change in `alert.service.ts`

Replace binary "in/out" with three-zone system:

```typescript
type RangeZoneStatus = 'SAFE' | 'DANGER_ZONE' | 'OUT_OF_RANGE';

function getRangeZone(currentPrice: number, lower: number, upper: number): RangeZoneStatus {
  const rangeWidth = upper - lower;
  const buffer = rangeWidth * 0.15; // 15% of range width each side

  if (currentPrice < lower || currentPrice > upper) return 'OUT_OF_RANGE';
  if (currentPrice < lower + buffer || currentPrice > upper - buffer) return 'DANGER_ZONE';
  return 'SAFE';
}
```

- `SAFE` → no alert
- `DANGER_ZONE` → optional warning notification (configurable in settings)
- `OUT_OF_RANGE` → full alert (existing behavior, now with TWAP guard from Feature 3)

### Frontend
Range chart shows buffer zone as a semi-transparent yellow band inside each edge. Badge: 🟢 Safe / 🟡 X% from edge / 🔴 Out of range.

---

## Feature 3 — AutoExit TWAP Anti-Wick

### Purpose
Prevent spurious "out of range" alerts triggered by momentary price spikes (wicks). Inspired by Revert's TWAP oracle check before AutoExit.

### Location
- `alert.service.ts` — wraps the OUT_OF_RANGE trigger
- `ScoutSettings.tsx` — configurable confirmation window

### Backend Logic

Add to `MemoryStore`: `priceOutTimestamp: Map<poolId, timestamp>`

```typescript
// In alert.service.ts — before sending OUT_OF_RANGE alert:
function shouldSendAlert(poolId: string, confirmWindowMs: number): boolean {
  const outSince = memoryStore.getPriceOutTimestamp(poolId);
  if (!outSince) {
    memoryStore.setPriceOutTimestamp(poolId, Date.now());
    return false; // start the clock, don't alert yet
  }
  const elapsed = Date.now() - outSince;
  if (elapsed >= confirmWindowMs) {
    memoryStore.clearPriceOutTimestamp(poolId); // reset after alerting
    return true;
  }
  return false; // still in confirmation window
}

// Reset timestamp when price returns to range:
// memoryStore.clearPriceOutTimestamp(poolId)
```

**Confirmation window options (configurable per alert in Settings):**
- 2 min, 5 min (default), 10 min, 15 min

### Settings UI
In `ScoutSettings.tsx`, add to the alert configuration section:
> "Aguardar [dropdown: 2min / 5min / 10min / 15min] antes de alertar saída de range (evita alertas por wicks)"

Stored in existing `settings` table via `/api/settings/alerts/wick-confirm-minutes`.

---

## Feature 4 — Backtesting with Real On-Chain Data (TheGraph)

### Purpose
Replace synthetic GBM price simulation in backtester with real historical poolHourData from TheGraph — producing credible, evidence-based performance estimates.

### Location
- New service: `backtest-real.service.ts`
- New endpoint: `GET /api/backtest-real/:chain/:address`
- New tab in `Simulation.tsx`: "Backtest Real" alongside existing synthetic

### Backend Service

```typescript
interface RealBacktestParams {
  chain: string;
  address: string;
  rangeLower: number;
  rangeUpper: number;
  capital: number;
  days: number; // 7 | 14 | 30 | 90
}

interface RealBacktestResult {
  source: 'thegraph' | 'unavailable';
  dataPoints: number;          // hours of real data used
  apr: number;                 // annualized from real fees
  ilPercent: number;           // real IL from price path
  feesEarned: number;          // USD from real volume data
  timeInRangePct: number;      // % of hourly candles where price in range
  pnlPercent: number;          // fees - IL
  priceStart: number;
  priceEnd: number;
  priceMin: number;
  priceMax: number;
  hourlySnapshots: Array<{
    timestamp: number;
    price: number;
    inRange: boolean;
    feesAccum: number;
    ilAccum: number;
  }>;
  vsGbm?: {                    // comparison with synthetic result
    aprDiff: number;
    ilDiff: number;
  };
}
```

**Algorithm:**
1. Fetch `poolHourData` from TheGraph (up to 90 entries = 90 days hourly)
2. For each hour: determine if price was in range, accrue fees proportionally
3. Calculate IL using real start/end prices via V3 formula
4. Annualize results

**Fallback:** If TheGraph unavailable or returns <7 data points → return `source: 'unavailable'`, frontend falls back to existing GBM tab.

### Frontend
New tab "📊 Backtest Real" in `Simulation.tsx` alongside existing "Monte Carlo":
- Shows comparison table (real vs synthetic GBM)
- Timeline chart: price path + in-range bands
- Data quality badge: "N horas de dados reais" or "TheGraph indisponível — usando simulação"

---

## Feature 5 — Lending Simulator (Nova Página `/lending`)

### Purpose
Educational simulator showing what would happen if user used their LP position as collateral in a lending protocol (modeled after Revert Lend parameters).

### Route
`/lending` — new page `LendingSimulator.tsx`

### Backend
**New function in `calc.service.ts`:** `calcLendingPosition(params)`

```typescript
interface LendingSimulatorParams {
  poolId: string;
  capital: number;           // collateral value in USD
  poolScore: number;         // 0-100 (determines base LTV tier)
  poolVolatilityAnn: number; // annual volatility decimal
  ltvManual: number;         // user-set LTV % (0-95)
  interestRateManual: number;// user-set annual interest rate %
  borrowAmount: number;      // how much user wants to borrow (USD)
}

interface LendingSimulatorResult {
  ltvMax: number;            // protocol max (based on pool risk)
  ltvUsed: number;           // user's chosen LTV
  borrowCapacity: number;    // max USD user can borrow
  healthFactor: number;      // collateral / (borrow / ltvMax)
  liquidationPrice: number;  // pool price at which position gets liquidated
  liquidationDropPct: number;// % price drop that triggers liquidation
  interestCostAnnual: number;// USD/year in interest
  netApr: number;            // poolAPR - interestRate + leverage boost
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  scenarios: Array<{
    ltvPct: number;
    healthFactor: number;
    liquidationPrice: number;
    netApr: number;
  }>;
}
```

**LTV tiers (protocol baseline, overridable by user):**
- Score ≥ 75 (blue-chip): base LTV 70%
- Score 50-74: base LTV 55%
- Score < 50 (volatile): base LTV 35%

**Formula:**
```
healthFactor = (collateral * ltvMax) / borrowAmount
liquidationPrice = entryPrice * (1 - (healthFactor - 1) / healthFactor)
netApr = poolApr - interestRate + (borrowAmount / capital) * poolApr
```

**New endpoint:** `POST /api/calc/lending`

### Frontend UI (`LendingSimulator.tsx`)
1. Pool selector (search existing pools)
2. Two sliders: LTV % and Interest Rate %
3. Borrow amount input
4. Results panel:
   - Health Factor (color-coded: green >2.0, yellow 1.2-2.0, red <1.2)
   - Liquidation price + % drop from current price
   - Net APR with leverage
   - 3-scenario comparison table (conservative/moderate/aggressive LTV)
5. Disclaimer: "Simulação educacional. Não representa oferta de crédito."

---

## Feature 6 — Lending Risk Panel in Pool Detail

### Purpose
Show at-a-glance lending risk metrics directly in `ScoutPoolDetail.tsx` for users considering using the position as collateral.

### Location
New collapsible section in `ScoutPoolDetail.tsx` below the Projections card.

### Frontend Component (`LendingRiskPanel.tsx`)

Compact panel showing three preset scenarios automatically calculated from pool data:

| Cenário | LTV | Health Factor | Liquidação em |
|---|---|---|---|
| Conservador | 35% | 2.86 | -65% |
| Moderado | 55% | 1.82 | -45% |
| Agressivo | 70% | 1.43 | -30% |

- Color-coded health factors
- Risk badge per scenario
- Link: "Simular em detalhes →" → `/lending?pool=...`
- Collapses by default, expands on click

### Backend
Reuses `calcLendingPosition()` from Feature 5 with preset LTV values.
No new endpoint — computed client-side using pool data already loaded.

---

## Navigation Update

Add `/lending` to the sidebar navigation in the layout component:
- Icon: `Landmark` (Lucide)
- Label: "Lending Sim"
- Position: after Simulation in the nav

---

## Data Flow Summary

```
User action                  → Backend                    → Frontend
─────────────────────────────────────────────────────────────────────
Simulation page loads        → POST /api/calc/auto-compound → AutoCompound widget
Simulation "Backtest Real"   → GET /api/backtest-real/...  → Real backtest tab
Pool detail loads            → calcLending (client-side)   → LendingRiskPanel
/lending page loads          → POST /api/calc/lending      → Full simulator
Alert fires (range exit)     → alert.service buffer+TWAP   → Telegram/UI
Settings save                → PUT /api/settings/...       → TWAP confirm window
```

---

## Files to Create (New)

| File | Type | Purpose |
|---|---|---|
| `backend/src/services/backtest-real.service.ts` | Service | TheGraph real backtest |
| `frontend/src/pages/LendingSimulator.tsx` | Page | /lending page |
| `frontend/src/components/common/LendingRiskPanel.tsx` | Component | Pool detail widget |
| `frontend/src/components/common/AutoCompoundWidget.tsx` | Component | Compound calculator |

## Files to Modify (Existing)

| File | Change |
|---|---|
| `backend/src/services/calc.service.ts` | Add `calcAutoCompound()` + `calcLendingPosition()` |
| `backend/src/services/alert.service.ts` | Add buffer zone + TWAP anti-wick |
| `backend/src/services/memory-store.service.ts` | Add price-out timestamp tracking |
| `backend/src/routes/index.ts` | Add 3 new endpoints |
| `frontend/src/pages/Simulation.tsx` | Add AutoCompound widget + Real Backtest tab |
| `frontend/src/pages/ScoutPoolDetail.tsx` | Add LendingRiskPanel |
| `frontend/src/pages/ScoutSettings.tsx` | Add TWAP confirm window setting |
| `frontend/src/components/layout/Sidebar.tsx` | Add /lending nav item |
| `pool-intelligence-pro/backend/prisma/schema.prisma` | No change needed (uses existing settings table) |

---

## Non-Goals (Explicitly Out of Scope)

- Smart contracts or on-chain execution
- Real lending protocol integration (no actual borrowing)
- Liquidator bot (on-chain, requires capital + private keys)
- Wallet connection for reading real positions
- Automated compounding execution

---

## Success Criteria

1. `calcAutoCompound()` returns correct compound frequency (validated against manual calculation)
2. Alert buffer zone prevents alerts during normal price oscillation within buffer
3. TWAP anti-wick ignores spikes <configured window, confirms real exits
4. Real backtest uses actual TheGraph data with graceful fallback to GBM
5. Lending simulator health factor ≥ 1.0 with conservative LTV, liquidation price makes mathematical sense
6. All 4 new/modified pages build without TypeScript errors
7. Existing tests (360) continue passing

---

## Implementation Order (Parallel Waves)

**Wave 1 (parallel):**
- A: Backend — `calcAutoCompound()` + `calcLendingPosition()` in calc.service.ts
- B: Backend — `backtest-real.service.ts` (TheGraph integration)
- C: Backend — alert.service buffer + TWAP + memory-store changes

**Wave 2 (parallel, after Wave 1):**
- D: Frontend — `AutoCompoundWidget.tsx` + Simulation.tsx integration
- E: Frontend — `LendingSimulator.tsx` (new page)
- F: Frontend — `LendingRiskPanel.tsx` + ScoutPoolDetail integration
- G: Frontend — ScoutSettings TWAP config + Sidebar nav

**Wave 3:**
- Routes integration (endpoints for auto-compound + lending + backtest-real)
- Build verification + tests
- Commit + push
