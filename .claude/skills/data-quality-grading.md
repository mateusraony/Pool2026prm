# Data Quality Grading Skill

> How to classify and display data quality (A/B/C/D) for each pool metric.

## Grading System

### Grade A — High Confidence
- Data from primary provider, confirmed by secondary
- Divergence between sources < 5%
- Data age < 5 minutes
- Frontend: green badge / no indicator needed (default)

### Grade B — Medium Confidence
- Data from single provider (no cross-validation)
- Data age 5-15 minutes
- Divergence 5-15% between available sources
- Frontend: yellow badge with "~" prefix on values

### Grade C — Low Confidence
- Stale data (15-60 minutes old)
- Fallback provider used (primary failed)
- Divergence > 15% between sources
- Frontend: orange badge, values shown with "≈" prefix, tooltip explains

### Grade D — Estimated/Unreliable
- Data older than 1 hour
- Synthetic/calculated value (not from adapter)
- No provider returned data, using last known value
- Frontend: red badge with "est." label, tooltip "Dado estimado — fonte indisponível"

## Backend Implementation

The `dataConfidence` field in UnifiedPool already supports this. Map:
- `dataQuality: "GOOD"` → Grade A or B (depending on source count)
- `dataQuality: "STALE"` → Grade C
- `dataQuality: "SUSPECT"` → Grade D (investigate further)
- `dataQuality: "MISSING"` → Grade D

## Frontend Display Rules

1. Grade A: Show value normally, no extra indicator
2. Grade B: Show value with subtle yellow dot indicator
3. Grade C: Show value with orange warning icon + tooltip
4. Grade D: Show value with red estimated badge, different font style (italic)

## Score Impact

Data quality affects the score indirectly:
- Grade A/B: No penalty
- Grade C: +2 inconsistency penalty in risk section
- Grade D: +5 inconsistency penalty in risk section

## When to Recalculate Grade

- On every data refresh cycle (watchlist: 1 min, radar: 30 min)
- When provider health status changes
- When circuit breaker opens/closes for a provider
