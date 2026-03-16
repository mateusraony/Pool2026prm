# Backend Contract Guard Skill

> Ensures API endpoint signatures are not changed without explicit approval.

## Protected Endpoints

These endpoints are contracted with the frontend. Changing their signature
(path, method, required params, response shape) is a BREAKING CHANGE.

### Core Endpoints (NEVER change without frontend update)

| Method | Path | Response Shape |
|--------|------|---------------|
| GET | /api/pools | `{ success, data: Pool[], total?, page?, limit? }` |
| GET | /api/pools/:chain/:address | `{ success, data: Pool }` |
| GET | /api/pools-detail/:chain/:address | `{ success, data: { pool, ranges, fees, il } }` |
| GET | /api/recommendations | `{ success, data: Recommendation[] }` |
| GET | /api/health | `{ status, uptime, version, ... }` |
| GET | /api/tokens | `{ success, data: Token[] }` |

### CRUD Endpoints (shape is standard)

| Resource | GET (list) | POST (create) | DELETE (remove) |
|----------|-----------|---------------|-----------------|
| /api/watchlist | Pool[] | { poolId } | /:poolId |
| /api/alerts | Alert[] | { type, ... } | /:id |
| /api/ranges | RangePosition[] | { poolId, ... } | /:id |
| /api/favorites | Favorite[] | { poolId } | /:poolId |
| /api/notes | Note[] | { poolId, text } | /:id |

### Settings Endpoints

| Method | Path | Body/Response |
|--------|------|---------------|
| GET | /api/settings/notifications | NotificationSettings |
| PUT | /api/settings/notifications | NotificationSettings |
| GET | /api/settings/risk-config | RiskConfig |
| PUT | /api/settings/risk-config | RiskConfig |

## Rules

1. **Adding** new optional fields to responses is SAFE (additive change)
2. **Removing** fields from responses is BREAKING — requires frontend update first
3. **Changing** field types is BREAKING
4. **Renaming** paths is BREAKING
5. **Adding** new endpoints is SAFE
6. **Adding** required body params to POST/PUT is BREAKING

## Validation Pattern

All POST/PUT endpoints MUST use Zod schemas from `routes/validation.ts`.
New endpoints MUST add a corresponding schema before implementation.

## Standard Response Format

```typescript
{
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}
```

NEVER return raw data without wrapping in this format.
