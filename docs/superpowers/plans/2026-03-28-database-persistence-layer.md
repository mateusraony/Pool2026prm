# Database Persistence Layer — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist pools, scores, recommendations, snapshots, and metrics history to Supabase so data survives restarts and provides historical trends.

**Architecture:** Write-through pattern — jobs continue using MemoryStore for fast reads, but also write to PostgreSQL via Prisma. On cold-start, MemoryStore is hydrated from DB instead of starting empty. Existing Prisma models (PoolCurrent, PoolSnapshot, Score, Candidate, ProviderHealth, SystemLog, JobRun) are already defined but unused — we wire them up.

**Tech Stack:** Prisma Client (already configured), PostgreSQL (Supabase), existing MemoryStore

---

## Problem Statement

Currently, ALL runtime data lives exclusively in `MemoryStore` (in-memory):
- Pools (radar results) → lost on restart
- Scores → lost on restart
- Recommendations → lost on restart
- TVL history (liquidity drop detection) → lost on restart
- Metrics history (performance charts) → lost on restart
- Watchlist IDs → lost on restart

The Prisma schema already defines `PoolCurrent`, `PoolSnapshot`, `Score`, `Candidate`, `ProviderHealth`, `SystemLog`, `JobRun` models, but **no job or service writes to them**. This plan wires up the existing models.

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/services/db-sync.service.ts` | **CREATE** | Write-through DB sync — upsert pools, create snapshots, save scores |
| `backend/src/services/memory-store.service.ts` | **MODIFY** | Add `hydrateFromDb()` method for cold-start |
| `backend/src/jobs/index.ts` | **MODIFY** | Call dbSync after radar/recommendation jobs; hydrate on init |
| `backend/src/__tests__/db-sync.service.test.ts` | **CREATE** | Unit tests for DB sync logic |

**Key principle:** MemoryStore remains the primary read path (fast). DB is written async (fire-and-forget with error logging). On cold-start, DB hydrates MemoryStore.

---

### Task 1: Create db-sync.service.ts

**Files:**
- Create: `backend/src/services/db-sync.service.ts`
- Create: `backend/src/__tests__/db-sync.service.test.ts`

- [ ] **Step 1: Write the failing test for syncPools**

```typescript
// backend/src/__tests__/db-sync.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
const mockPrisma = {
  poolCurrent: {
    upsert: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
  },
  poolSnapshot: {
    create: vi.fn().mockResolvedValue({}),
  },
  score: {
    create: vi.fn().mockResolvedValue({}),
    findMany: vi.fn().mockResolvedValue([]),
  },
};

vi.mock('../routes/prisma.js', () => ({
  getPrisma: () => mockPrisma,
}));

vi.mock('./log.service.js', () => ({
  logService: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { dbSyncService } from '../services/db-sync.service.js';

describe('dbSyncService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('syncPools', () => {
    it('should upsert pools to PoolCurrent and create snapshots', async () => {
      const pools = [{
        id: 'ethereum_0x123',
        chain: 'ethereum',
        protocol: 'uniswap_v3',
        poolAddress: '0x123',
        token0: { symbol: 'WETH', address: '0xa', decimals: 18 },
        token1: { symbol: 'USDC', address: '0xb', decimals: 6 },
        feeTier: 0.003,
        currentPrice: 1800,
        tvlUSD: 5000000,
        volume24hUSD: 1200000,
        volume7dUSD: 8000000,
        fees24hUSD: 3600,
        fees7dUSD: 25000,
        apr: 26.3,
      }];

      await dbSyncService.syncPools(pools as any);

      expect(mockPrisma.poolCurrent.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrisma.poolSnapshot.create).toHaveBeenCalledTimes(1);
    });

    it('should not throw on DB errors (fire-and-forget)', async () => {
      mockPrisma.poolCurrent.upsert.mockRejectedValueOnce(new Error('DB down'));

      await expect(dbSyncService.syncPools([{ id: 'test' }] as any))
        .resolves.not.toThrow();
    });
  });

  describe('syncScores', () => {
    it('should create score records', async () => {
      const scores = [{ poolId: 'ethereum_0x123', score: { total: 75, health: 30, return: 25, risk: 5 } }];

      await dbSyncService.syncScores(scores as any);

      expect(mockPrisma.score.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('loadPoolsFromDb', () => {
    it('should return pools from database', async () => {
      mockPrisma.poolCurrent.findMany.mockResolvedValueOnce([{
        externalId: 'ethereum_0x123',
        chain: 'ethereum',
        protocol: 'uniswap_v3',
        poolAddress: '0x123',
        token0Symbol: 'WETH',
        token1Symbol: 'USDC',
        tvl: 5000000,
        volume24h: 1200000,
        lastUpdated: new Date(),
      }]);

      const pools = await dbSyncService.loadPoolsFromDb();
      expect(pools.length).toBe(1);
      expect(pools[0].id).toBe('ethereum_0x123');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pool-intelligence-pro/backend && npx vitest run src/__tests__/db-sync.service.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement db-sync.service.ts**

```typescript
// backend/src/services/db-sync.service.ts
import { getPrisma } from '../routes/prisma.js';
import { logService } from './log.service.js';
import type { UnifiedPool, Score } from '../types/index.js';

class DbSyncService {
  /**
   * Upsert pools to PoolCurrent + create PoolSnapshot.
   * Fire-and-forget: never throws, logs errors.
   */
  async syncPools(pools: UnifiedPool[]): Promise<void> {
    const prisma = getPrisma();
    let synced = 0;

    for (const pool of pools) {
      try {
        // Upsert PoolCurrent
        await prisma.poolCurrent.upsert({
          where: { externalId: pool.id },
          create: {
            externalId: pool.id,
            chain: pool.chain || '',
            protocol: pool.protocol || 'unknown',
            poolAddress: pool.poolAddress || '',
            token0Symbol: pool.token0?.symbol || '',
            token0Address: pool.token0?.address || '',
            token0Decimals: pool.token0?.decimals || 18,
            token1Symbol: pool.token1?.symbol || '',
            token1Address: pool.token1?.address || '',
            token1Decimals: pool.token1?.decimals || 18,
            feeTier: pool.feeTier ?? null,
            price: pool.currentPrice ?? null,
            priceToken0Usd: pool.token0?.priceUsd ?? null,
            priceToken1Usd: pool.token1?.priceUsd ?? null,
            tvl: pool.tvlUSD || 0,
            volume24h: pool.volume24hUSD || 0,
            volume7d: pool.volume7dUSD || 0,
            fees24h: pool.fees24hUSD || 0,
            fees7d: pool.fees7dUSD || 0,
            primarySource: pool.source || 'unknown',
            lastUpdated: new Date(),
          },
          update: {
            price: pool.currentPrice ?? null,
            priceToken0Usd: pool.token0?.priceUsd ?? null,
            priceToken1Usd: pool.token1?.priceUsd ?? null,
            tvl: pool.tvlUSD || 0,
            volume24h: pool.volume24hUSD || 0,
            volume7d: pool.volume7dUSD || 0,
            fees24h: pool.fees24hUSD || 0,
            fees7d: pool.fees7dUSD || 0,
            lastUpdated: new Date(),
          },
        });

        // Create snapshot (time-series)
        const poolRecord = await prisma.poolCurrent.findUnique({
          where: { externalId: pool.id },
          select: { id: true },
        });

        if (poolRecord) {
          await prisma.poolSnapshot.create({
            data: {
              poolId: poolRecord.id,
              price: pool.currentPrice ?? null,
              tvl: pool.tvlUSD || 0,
              volume24h: pool.volume24hUSD || 0,
              fees24h: pool.fees24hUSD || 0,
              aprFee: pool.apr ?? null,
            },
          });
        }

        synced++;
      } catch (error) {
        logService.warn('SYSTEM', `DB sync failed for pool ${pool.id}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (synced > 0) {
      logService.info('SYSTEM', `DB sync: ${synced}/${pools.length} pools persisted`);
    }
  }

  /**
   * Save scores to Score table (historical tracking).
   */
  async syncScores(entries: Array<{ poolId: string; score: Score }>): Promise<void> {
    const prisma = getPrisma();

    for (const { poolId, score } of entries) {
      try {
        const poolRecord = await prisma.poolCurrent.findUnique({
          where: { externalId: poolId },
          select: { id: true },
        });

        if (!poolRecord) continue;

        await prisma.score.create({
          data: {
            poolId: poolRecord.id,
            totalScore: score.total,
            healthScore: score.health,
            returnScore: score.return,
            riskScore: score.risk,
            healthBreakdown: score.breakdown.health as any,
            returnBreakdown: score.breakdown.return as any,
            riskBreakdown: score.breakdown.risk as any,
            recommendedMode: score.recommendedMode,
            isSuspect: score.isSuspect || false,
            suspectReason: score.suspectReason,
            calculatedAt: new Date(),
            dataTimestamp: new Date(),
          },
        });
      } catch (error) {
        logService.warn('SYSTEM', `Score sync failed for ${poolId}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Load pools from DB to hydrate MemoryStore on cold-start.
   * Returns UnifiedPool-like objects with enough data for display.
   */
  async loadPoolsFromDb(): Promise<UnifiedPool[]> {
    try {
      const prisma = getPrisma();
      const dbPools = await prisma.poolCurrent.findMany({
        where: {
          lastUpdated: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // last 24h only
          },
        },
        orderBy: { tvl: 'desc' },
        take: 500,
      });

      return dbPools.map(p => ({
        id: p.externalId,
        chain: p.chain,
        protocol: p.protocol,
        poolAddress: p.poolAddress,
        token0: {
          symbol: p.token0Symbol,
          address: p.token0Address,
          decimals: p.token0Decimals,
          priceUsd: p.priceToken0Usd,
        },
        token1: {
          symbol: p.token1Symbol,
          address: p.token1Address,
          decimals: p.token1Decimals,
          priceUsd: p.priceToken1Usd,
        },
        feeTier: p.feeTier,
        currentPrice: p.price,
        tvlUSD: p.tvl,
        volume24hUSD: p.volume24h,
        volume7dUSD: p.volume7d,
        fees24hUSD: p.fees24h,
        fees7dUSD: p.fees7d,
        apr: null,
        source: p.primarySource,
        updatedAt: p.lastUpdated.toISOString(),
        // Fields that require live data — filled when radar refreshes
        volume1hUSD: null,
        volume5mUSD: null,
        priceChange24h: p.priceChange24h,
        priceChange7d: p.priceChange7d,
        bluechip: false,
        volatilityAnn: null,
      })) as unknown as UnifiedPool[];
    } catch (error) {
      logService.warn('SYSTEM', 'Failed to load pools from DB', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Load latest scores from DB for cold-start.
   */
  async loadScoresFromDb(): Promise<Map<string, Score>> {
    const scores = new Map<string, Score>();
    try {
      const prisma = getPrisma();
      // Get latest score per pool (subquery approach)
      const dbScores = await prisma.score.findMany({
        where: {
          calculatedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { calculatedAt: 'desc' },
        take: 500,
        include: { pool: { select: { externalId: true } } },
      });

      // Keep only latest per pool
      for (const s of dbScores) {
        if (!scores.has(s.pool.externalId)) {
          scores.set(s.pool.externalId, {
            total: s.totalScore,
            health: s.healthScore,
            return: s.returnScore,
            risk: s.riskScore,
            breakdown: {
              health: s.healthBreakdown as any,
              return: s.returnBreakdown as any,
              risk: s.riskBreakdown as any,
            },
            recommendedMode: s.recommendedMode as any,
            isSuspect: s.isSuspect,
            suspectReason: s.suspectReason ?? undefined,
          });
        }
      }
    } catch (error) {
      logService.warn('SYSTEM', 'Failed to load scores from DB', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return scores;
  }

  /**
   * Cleanup old snapshots (keep last 30 days).
   * Run daily via cron.
   */
  async cleanupOldSnapshots(daysToKeep: number = 30): Promise<number> {
    try {
      const prisma = getPrisma();
      const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
      const result = await prisma.poolSnapshot.deleteMany({
        where: { timestamp: { lt: cutoff } },
      });
      logService.info('SYSTEM', `Cleaned ${result.count} old snapshots`);
      return result.count;
    } catch (error) {
      logService.warn('SYSTEM', 'Snapshot cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }
}

export const dbSyncService = new DbSyncService();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pool-intelligence-pro/backend && npx vitest run src/__tests__/db-sync.service.test.ts`
Expected: 3/3 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/db-sync.service.ts backend/src/__tests__/db-sync.service.test.ts
git commit -m "feat: adicionar db-sync.service para persistir pools e scores no Supabase"
```

---

### Task 2: Wire up DB sync in jobs + cold-start hydration

**Files:**
- Modify: `backend/src/jobs/index.ts`

- [ ] **Step 1: Add DB sync import and hydration on init**

In `jobs/index.ts`, add import:
```typescript
import { dbSyncService } from '../services/db-sync.service.js';
```

- [ ] **Step 2: Add DB sync call after radar job stores pools**

In `radarJobRunner()`, after `memoryStore.setPools(unifiedPools)` (line ~101), add:
```typescript
    // Persist to DB (async, fire-and-forget)
    dbSyncService.syncPools(unifiedPools).catch(err =>
      logService.warn('SYSTEM', 'DB pool sync failed', { error: String(err) })
    );

    // Sync scores to DB
    const scoreEntries = radarResults.map(r => ({
      poolId: r.pool.externalId,
      score: r.score,
    }));
    dbSyncService.syncScores(scoreEntries).catch(err =>
      logService.warn('SYSTEM', 'DB score sync failed', { error: String(err) })
    );
```

- [ ] **Step 3: Add cold-start hydration in initializeJobs**

In `initializeJobs()`, before the initial radar run (line ~368), add:
```typescript
  // Cold-start: hydrate MemoryStore from DB
  try {
    const dbPools = await dbSyncService.loadPoolsFromDb();
    if (dbPools.length > 0) {
      memoryStore.setPools(dbPools);
      logService.info('SYSTEM', `Cold-start: loaded ${dbPools.length} pools from DB`);
    }

    const dbScores = await dbSyncService.loadScoresFromDb();
    for (const [poolId, score] of dbScores) {
      memoryStore.setScore(poolId, score);
    }
    if (dbScores.size > 0) {
      logService.info('SYSTEM', `Cold-start: loaded ${dbScores.size} scores from DB`);
    }
  } catch (err) {
    logService.warn('SYSTEM', 'Cold-start DB hydration failed (will fetch fresh)', { error: String(err) });
  }
```

Note: `initializeJobs` needs to become `async`.

- [ ] **Step 4: Add daily snapshot cleanup cron**

In `initializeJobs()`, after existing cron schedules, add:
```typescript
  // Cleanup old snapshots: daily at 3 AM
  cron.schedule('0 3 * * *', async () => {
    await dbSyncService.cleanupOldSnapshots(30);
  });
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd pool-intelligence-pro/backend && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Run all tests**

Run: `cd pool-intelligence-pro/backend && npx vitest run`
Expected: all pass (349+ tests)

- [ ] **Step 7: Commit**

```bash
git add backend/src/jobs/index.ts
git commit -m "feat: conectar db-sync aos jobs — persistir pools/scores + cold-start hydration"
```

---

### Task 3: Add snapshot history API endpoint

**Files:**
- Modify: `backend/src/routes/pools.routes.ts`
- Modify: `backend/src/routes/validation.ts`

- [ ] **Step 1: Add Zod schema for snapshot query**

In `validation.ts`, add:
```typescript
export const snapshotQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(7),
});
```

- [ ] **Step 2: Add snapshot history endpoint**

In `pools.routes.ts`, add endpoint after the pool detail routes:
```typescript
// GET /pools/:chain/:address/snapshots — historical snapshots from DB
router.get('/pools/:chain/:address/snapshots', validate(snapshotQuerySchema, 'query'), async (req, res) => {
  try {
    const poolId = `${req.params.chain}_${req.params.address}`;
    const days = (req as any).validatedQuery?.days ?? 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const prisma = getPrisma();
    const pool = await prisma.poolCurrent.findUnique({
      where: { externalId: poolId },
      select: { id: true },
    });

    if (!pool) {
      return res.json({ success: true, data: [], timestamp: new Date() });
    }

    const snapshots = await prisma.poolSnapshot.findMany({
      where: { poolId: pool.id, timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
      select: {
        timestamp: true,
        price: true,
        tvl: true,
        volume24h: true,
        fees24h: true,
        aprFee: true,
      },
    });

    res.json({ success: true, data: snapshots, timestamp: new Date() });
  } catch (error) {
    logService.error('POOLS', 'Failed to get snapshots', { error });
    res.status(500).json({ success: false, error: 'Failed to get snapshots' });
  }
});
```

- [ ] **Step 3: Verify TypeScript compiles + tests pass**

Run: `cd pool-intelligence-pro/backend && npx tsc --noEmit && npx vitest run`

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/pools.routes.ts backend/src/routes/validation.ts
git commit -m "feat: endpoint GET /pools/:chain/:address/snapshots para histórico de DB"
```

---

### Task 4: CSP — Replace unsafe-inline with hash for SW script

**Files:**
- Modify: `backend/src/index.ts`
- Modify: `frontend/index.html` (no change needed, just read for hash)

The inline script in `index.html` line 30-35 is static and never changes, so we can compute its SHA-256 hash and use that instead of `'unsafe-inline'` for scriptSrc.

- [ ] **Step 1: Compute SHA-256 hash of the inline script**

The inline script content (between `<script>` tags, lines 30-35):
```
\n      if ('serviceWorker' in navigator) {\n        window.addEventListener('load', () => {\n          navigator.serviceWorker.register('/sw.js').catch(() => {});\n        });\n      }\n
```

Run: `echo -n "
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('/sw.js').catch(() => {});
        });
      }
    " | openssl dgst -sha256 -binary | openssl base64`

Use the resulting hash as `'sha256-XXXX'`.

- [ ] **Step 2: Update CSP scriptSrc with hash**

In `backend/src/index.ts`, replace:
```typescript
scriptSrc: ["'self'", "'unsafe-inline'"],
```
with:
```typescript
scriptSrc: ["'self'", "'sha256-<COMPUTED_HASH>'"],
```

Note: `styleSrc` keeps `'unsafe-inline'` because Tailwind/Vite injects dynamic styles.

- [ ] **Step 3: Verify build works**

Run: `cd pool-intelligence-pro && npm run build`

- [ ] **Step 4: Commit**

```bash
git add backend/src/index.ts
git commit -m "fix: CSP scriptSrc usar hash SHA-256 ao invés de unsafe-inline"
```

---

## Verification Checklist

After all tasks:
- [ ] `npx tsc --noEmit` (backend) — 0 errors
- [ ] `npx tsc --noEmit` (frontend) — 0 errors
- [ ] `npx vitest run` (backend) — all pass
- [ ] `npx vitest run` (frontend) — all pass
- [ ] `npm run build` — OK
- [ ] Cold-start: restart server → MemoryStore populated from DB
- [ ] Radar job: after run → data visible in Supabase Table Editor
- [ ] Snapshots: `GET /api/pools/ethereum/0x.../snapshots` returns historical data

## Data Flow After Implementation

```
API Providers → Radar Job → MemoryStore (fast reads)
                         ↘ Supabase DB (persistence)

Cold-start → DB → MemoryStore (instant data while waiting for radar)

Frontend → /api/pools → MemoryStore (fast)
Frontend → /api/pools/:id/snapshots → DB (historical)
```
