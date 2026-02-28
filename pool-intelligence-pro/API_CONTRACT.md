# API Contract — Pool Intelligence Pro

Base URL: `https://pool-intelligence-api.onrender.com/api`

All responses include `timestamp: string` (ISO 8601).
Error responses follow: `{ success: false, error: "message" }`.

---

## Health

### GET /health
System health check.

**Response:**
```json
{
  "status": "HEALTHY" | "DEGRADED" | "UNHEALTHY",
  "providers": [{ "name": "string", "isHealthy": true, "isCircuitOpen": false, "consecutiveFailures": 0, "isOptional": false }],
  "cache": { "hits": 0, "misses": 0, "sets": 0, "keys": 0, "hitRate": 0 },
  "memoryStore": { "pools": 0, "scores": 0, "watchlist": 0, "hasRecs": false, "recsFresh": false, "reads": 0, "hits": 0, "misses": 0, "writes": 0, "hitRatePct": 0, "estimatedKB": 0 },
  "alerts": { "rulesCount": 0, "recentAlertsCount": 0, "triggersToday": 0 },
  "timestamp": "string"
}
```

---

## Pools

### GET /pools
List pools with filters, sorting, pagination.

**Query params:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| chain | string | - | Filter by chain (ethereum, arbitrum, base, optimism, polygon) |
| protocol | string | - | Filter by protocol (uniswap-v3, etc) |
| token | string | - | Filter by token symbol |
| bluechip | "true" | - | Only blue-chip pools |
| poolType | string | - | CL, V2, STABLE |
| sortBy | string | "tvl" | Sort field: tvl, apr, aprFee, aprAdjusted, volume1h, volume5m, fees1h, fees5m, healthScore, volatilityAnn, ratio |
| sortDirection | "asc"/"desc" | "desc" | Sort direction |
| page | number | null | Page number (1-based) |
| limit | number | 50 | Max 200 |
| minTVL | number | - | Minimum TVL filter |
| minHealth | number | - | Minimum health score filter |

**Response:**
```json
{
  "pools": [UnifiedPool],
  "total": 0,
  "page": null,
  "limit": 50,
  "fromMemory": true,
  "syncing": false,
  "tokenFilters": ["ETH", "USDC"],
  "timestamp": "string"
}
```

**UnifiedPool shape:**
```json
{
  "id": "string",
  "chain": "string",
  "protocol": "string",
  "poolAddress": "string",
  "poolType": "CL" | "V2" | "STABLE",
  "baseToken": "string",
  "quoteToken": "string",
  "token0": { "symbol": "string", "address": "string", "decimals": 18 },
  "token1": { "symbol": "string", "address": "string", "decimals": 18 },
  "tvlUSD": 0,
  "price": 0,
  "feeTier": 0.003,
  "volume5mUSD": null,
  "volume1hUSD": null,
  "volume24hUSD": 0,
  "fees5mUSD": null,
  "fees1hUSD": null,
  "fees24hUSD": null,
  "aprFee": null,
  "aprIncentive": 0,
  "aprTotal": null,
  "aprAdjusted": null,
  "volatilityAnn": 0.3,
  "ratio": 0,
  "healthScore": 50,
  "penaltyTotal": 1,
  "bluechip": false,
  "warnings": [],
  "updatedAt": "string",
  "tvl": 0,
  "volume24h": 0
}
```

### GET /pools/:chain/:address
Get single pool with score.

**Response:**
```json
{
  "success": true,
  "data": {
    "pool": Pool,
    "score": Score
  },
  "provider": "radar-cache" | "memory-store" | "thegraph" | "geckoterminal",
  "usedFallback": false,
  "timestamp": "string"
}
```

**Pool shape (legacy):**
```json
{
  "externalId": "string",
  "chain": "string",
  "protocol": "string",
  "poolAddress": "string",
  "token0": { "symbol": "string", "address": "string", "decimals": 18, "priceUsd": 0 },
  "token1": { "symbol": "string", "address": "string", "decimals": 18, "priceUsd": 0 },
  "feeTier": 0.003,
  "price": 0,
  "tvl": 0,
  "volume24h": 0,
  "volume7d": 0,
  "fees24h": 0,
  "fees7d": 0,
  "apr": 0,
  "volatilityAnn": 0.3
}
```

**Score shape:**
```json
{
  "total": 75,
  "health": 80,
  "return": 70,
  "risk": 60,
  "breakdown": {
    "health": { "liquidityStability": 0, "ageScore": 0, "volumeConsistency": 0 },
    "return": { "volumeTvlRatio": 0, "feeEfficiency": 0, "aprEstimate": 0 },
    "risk": { "volatilityPenalty": 0, "liquidityDropPenalty": 0, "inconsistencyPenalty": 0, "spreadPenalty": 0 }
  },
  "recommendedMode": "DEFENSIVE" | "NORMAL" | "AGGRESSIVE",
  "isSuspect": false,
  "suspectReason": "string"
}
```

### GET /pools-detail/:chain/:address
Enhanced pool detail with history, ranges, fees, IL risk.

**Query params:**
| Param | Type | Default |
|-------|------|---------|
| horizonDays | number | 7 |
| riskMode | string | "NORMAL" |
| capital | number | 1000 |

**Response:**
```json
{
  "success": true,
  "data": {
    "pool": UnifiedPool,
    "score": Score,
    "history": [{ "timestamp": "string", "price": 0, "tvl": 0, "volume24h": 0, "fees24h": 0 }],
    "ranges": {
      "DEFENSIVE": RangeResult,
      "NORMAL": RangeResult,
      "AGGRESSIVE": RangeResult
    },
    "selectedRange": RangeResult,
    "feeEstimates": {
      "DEFENSIVE": FeeEstimate,
      "NORMAL": FeeEstimate,
      "AGGRESSIVE": FeeEstimate
    },
    "ilRisk": ILRiskResult,
    "recommendations": []
  },
  "provider": "string",
  "timestamp": "string"
}
```

---

## Range Calculator

### POST /range-calc
Standalone range/fee/IL calculation.

**Body:**
```json
{
  "price": 1800,
  "volAnn": 0.40,
  "horizonDays": 7,
  "riskMode": "NORMAL",
  "tickSpacing": null,
  "poolType": "CL",
  "capital": 1000,
  "tvl": 5000000,
  "fees24h": 15000
}
```
Required: `price` (must be > 0).

**Response:**
```json
{
  "success": true,
  "data": {
    "ranges": { "DEFENSIVE": RangeResult, "NORMAL": RangeResult, "AGGRESSIVE": RangeResult },
    "selected": RangeResult,
    "feeEstimate": FeeEstimate,
    "ilRisk": ILRiskResult
  }
}
```

**RangeResult:** `{ lower, upper, widthPct, lowerTick?, upperTick?, probOutOfRange, mode, horizonDays }`
**FeeEstimate:** `{ expectedFees24h, expectedFees7d, expectedFees30d, userLiquidityShare, k_active }`
**ILRiskResult:** `{ probOutOfRange, ilRiskScore, horizonDays }`

---

## Recommendations

### GET /recommendations
AI-powered pool recommendations.

**Query params:**
| Param | Type | Default |
|-------|------|---------|
| mode | string | - | DEFENSIVE, NORMAL, AGGRESSIVE |
| limit | number | 10 | Max 20 |
| tokens | string | - | Comma-separated token filter |
| useTokenFilter | "true" | - | Use saved token filters |

**Response:**
```json
{
  "success": true,
  "data": [Recommendation],
  "total": 0,
  "filteredTotal": 0,
  "mode": "NORMAL",
  "capital": 10000,
  "tokenFilters": [],
  "timestamp": "string"
}
```

---

## Watchlist

### GET /watchlist
**Response:** `{ success: true, data: [{ poolId, chain, address }], count: 0 }`

### POST /watchlist
**Body:** `{ poolId: "string", chain: "string", address: "string" }`
Required: all fields.

### DELETE /watchlist/:poolId
Remove pool from watchlist.

---

## Favorites (Prisma DB)

### GET /favorites
**Response:** `{ success: true, data: [FavoritePool] }`

### POST /favorites
**Body:** `{ poolId, chain, poolAddress, token0Symbol?, token1Symbol?, protocol? }`
Required: poolId, chain, poolAddress.

### DELETE /favorites/:poolId
Remove favorite.

---

## Notes (Prisma DB)

### GET /notes
**Query:** `?poolId=string` (optional filter)
**Response:** `{ success: true, data: [{ id, poolId, text, tags: [], createdAt, updatedAt }] }`

### POST /notes
**Body:** `{ poolId: "string", text: "string", tags?: string[] }`
Required: poolId, text.

### DELETE /notes/:id
Delete specific note.

---

## Alerts

### GET /alerts
**Response:** `{ success: true, data: { rules: [{ id, rule: { type, poolId?, value? } }], recentAlerts: [{ type, message, timestamp }] } }`

### POST /alerts
**Body:** `{ poolId?: "string", type: "string", threshold: number }`
Required: type, threshold.

### DELETE /alerts/:id
Delete alert rule.

---

## Range Monitoring

### GET /ranges
**Response:** `{ success: true, data: [RangePosition], stats: {...} }`

### POST /ranges
**Body:**
```json
{
  "poolId": "string",
  "chain": "string",
  "poolAddress": "string",
  "token0Symbol": "string",
  "token1Symbol": "string",
  "rangeLower": 1500,
  "rangeUpper": 2100,
  "entryPrice": 1800,
  "capital": 1000,
  "mode": "NORMAL",
  "alertThreshold": 5
}
```
Required: poolId, rangeLower, rangeUpper.

### DELETE /ranges/:id
Stop monitoring a position.

### POST /ranges/check
Manually trigger range check for all positions.

### POST /ranges/report
Trigger portfolio report via Telegram.

---

## Settings

### GET /settings
**Response:**
```json
{
  "success": true,
  "data": {
    "system": { "mode": "NORMAL", "capital": 10000, "chains": [], "thresholds": {...}, "scoreWeights": {...} },
    "notifications": NotificationSettings,
    "telegram": { "enabled": false, "chatId": null }
  }
}
```

### PUT /settings/notifications
Update notification preferences.
**Body:** Partial NotificationSettings.

### POST /settings/telegram/test
Send test message to Telegram.

### POST /settings/telegram/test-recommendations
**Body:** `{ limit?: 5, useTokenFilter?: true }`
Send top recommendations via Telegram.

---

## Tokens

### GET /tokens
**Response:** `string[]` (flat array of token symbols)

---

## Logs

### GET /logs
**Query:** `?limit=100&level=error&component=SYSTEM`
**Response:** `{ success: true, data: [{ level, component, message, timestamp }] }`

---

## feeTier Convention
Backend stores feeTier as **decimal fraction** (0.003 = 0.3%).
Frontend normalizes via `feeTierToBps()` and `feeTierToPercent()` from `constants.ts`.
