# Dashboard Safe Render Skill

> Guidelines for rendering pool data safely when data is missing, stale, or loading.

## The Three States

Every data-driven component MUST handle:

1. **Loading** — Data is being fetched
2. **Error** — Fetch failed or data is invalid
3. **Empty** — Fetch succeeded but no data

## Loading State

- Show skeleton/shimmer animation (shadcn Skeleton component)
- NEVER show "0" or blank values during loading — user will think data is missing
- Use `isLoading` from React Query / Zustand

```tsx
if (isLoading) return <Skeleton className="h-8 w-24" />;
```

## Error State

- Show a subtle error indicator, NOT a full-page crash
- Log to console in development
- Offer a "Retry" button

```tsx
if (error) return (
  <div className="text-muted-foreground text-sm">
    Dados indisponíveis <Button variant="ghost" size="sm" onClick={refetch}>Tentar novamente</Button>
  </div>
);
```

## Empty State

- Show contextual empty message
- NEVER show an empty table/chart with no explanation

```tsx
if (data.length === 0) return (
  <p className="text-muted-foreground text-center py-8">
    Nenhuma pool encontrada para os filtros selecionados.
  </p>
);
```

## Numeric Fallbacks

When displaying pool metrics:

| Field | Missing Value | Display |
|-------|--------------|---------|
| tvl | 0 or undefined | "—" (em dash) |
| volume24h | 0 | "$0" (zero is valid) |
| apr | undefined | "—" |
| price | 0 or undefined | "—" |
| score.total | undefined | "N/A" with gray badge |
| fees24h | undefined | "—" |

## Formatting Helpers

- Always use `toLocaleString()` for numbers
- TVL/Volume: Use compact notation ($1.2M, $450K)
- APR: Show with 1 decimal (25.3%)
- Price: Show 2-6 decimals depending on magnitude
- Score: Show as integer (65/100)

## Chart Data

- If < 3 data points, show "Dados insuficientes para gráfico"
- If data has gaps (null values), interpolate or show dotted line
- Always label axes and show units
- Time axis: use relative time for < 24h, date for > 24h

## Mobile Responsiveness

- Tables become cards on mobile
- Charts reduce to sparklines on mobile
- Hide secondary metrics on small screens (show on expand)
