# Intelligence (Phase 6)

## Package

`packages/alerts` — detectors run after each ingest sync (`runIntelligenceDetectors`).

| Detector | Alert type | Output |
|----------|------------|--------|
| Budget variance vs `rollup_monthly` | `budget_variance` | Hebrew alert when actual > budget |
| Monthly recurring merchant+amount | — | `recurring_instruments` rows |
| Subscription price rise | `price_increase` | Hebrew alert; rules in Alert thresholds |
| Unusual card purchase | `anomaly` | Hebrew alert; rules in Alert thresholds |
| Same merchant/amount/day | `duplicate` | Hebrew alert |
| Recurring + loan schedule | — | `forecastCashflow()` 90-day projection |
| Category month patterns | — | `buildCategoryInsights()` — seven deterministic triggers (missing recurring, merchant disappeared/spike/drop, new merchant, category vs average, dominant transaction); needs ≥3 months history |

## Eligibility (one shared loader)

`eligible-transactions.ts` (`loadDetectableTransactions`) feeds subscriptions / price increase, anomalies and duplicates. It keeps debit rows only and drops kinds `transfer`, `card_settlement`, `loan_payment`, `income`, `refund`, `excluded_from_totals` rows, accounts with `scope = 'business'`, and the taxes & fees, savings, internal-transfer, card-bill and loans & mortgage system categories. Alerts and recurring instruments persist, so `resolveStaleDetections` runs first in every `runIntelligenceDetectors` pass: it sets open `price_increase` / `anomaly` / `duplicate` alerts to `dismissed` and active recurring instruments to `ended` when their rows are no longer eligible. Budget variance is untouched.

## Alert thresholds (`detection-rules.ts`, `subscriptions.ts`, `anomalies.ts`)

- **Price increase**: >=3 monthly charges (25-35 days apart, each within 5% of the previous one) at a stable price, then a charge >=10% AND >=10 ILS higher. Fires once, on the first higher charge. Never for P2P wording (Bit / PayBox / "העברה" / transfer), community / residential / youth-movement / kindergarten wording, or any known category outside telecom (52), insurance (70 + children) and entertainment (91); uncategorized rows are allowed. Wording lists are short on purpose; payments to private people are caught only by that wording.
- **Unusual amount**: card purchases only (`cardId` set or account kind `credit_card`), merchant has >=4 earlier purchases, amount >=2x their median AND >=100 ILS above it. P2P-worded rows are skipped.
- **Body text**: one sentence that never repeats the title, e.g. "<merchant>: עכשיו 46.70 ₪ במקום 27.60 ₪ (עלייה של 69%)". Generated at detection time; existing open alerts keep their old text.
- **Stale pass**: `resolveStaleDetections` also re-evaluates open `price_increase` / `anomaly` alerts against these rules (series cut at the alert's transaction) and dismisses those that no longer qualify.
- `recurring_instruments` (forecast input) still use the looser merchant+account monthly grouping; only alerts are tightened.
- Alerts page: below md the filters are chips and bulk select is hidden; md+ keeps selects and bulk dismiss. Copy under `alertsUx` in `he.json`.

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
