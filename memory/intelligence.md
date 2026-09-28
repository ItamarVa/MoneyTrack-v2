# Intelligence (Phase 6)

## Package

`packages/alerts` — detectors run after each ingest sync (`runIntelligenceDetectors`).

| Detector | Alert type | Output |
|----------|------------|--------|
| Budget variance vs `rollup_monthly` | `budget_variance` | Hebrew alert when actual > budget |
| Monthly recurring merchant+amount | — | `recurring_instruments` rows |
| Recurring price jump >10% | `price_increase` | Hebrew alert |
| Merchant MAD outlier | `anomaly` | Hebrew alert |
| Same merchant/amount/day | `duplicate` | Hebrew alert |
| Recurring + loan schedule | — | `forecastCashflow()` 90-day projection |
| Category month patterns | — | `buildCategoryInsights()` — seven deterministic triggers (missing recurring, merchant disappeared/spike/drop, new merchant, category vs average, dominant transaction); needs ≥3 months history |

## APIs

- `GET/PATCH /api/alerts` — inbox, dismiss
- `GET/POST/PATCH /api/budgets` — monthly per category
- `GET /api/forecast/cashflow` — 90-day outflow forecast
- `GET /api/networth` — snapshots for chart
- `GET /api/dashboard/home` — home KPIs
- `GET /api/analysis/categories/[categoryId]?period=YYYY-MM` — month summary, prior-month comparison, `insights[]`

## UI

- `/alerts` — Hebrew RTL inbox
- `/networth` — Recharts line chart from `net_worth_snapshots`
- `/dashboard` — KPI cards with drill-down links
- Budget panel on `/analysis` and `/settings`
- `/categories/[categoryId]` — merchant donut, 12-month bars, transaction list, insight cards; Hebrew labels in `category-insight-labels.ts`
