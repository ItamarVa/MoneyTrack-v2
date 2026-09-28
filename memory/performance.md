---
topic: performance
tags: [v2, budgets, ci]
last_updated: 2026-09-28
status: active
owns:
  - packages/engine/**
  - scripts/benchmarks/**
---

# Performance (MEM-PERF)

## Targets (50k transactions, 5 years, 6 cards, 4 people)

Aspirational. The CI gate in `scripts/benchmarks/golden-budgets.json` holds much
looser regression ceilings — see below for why.

| Metric | Target | Measured 2026-09-15 |
|--------|--------|---------------------|
| p95 interaction latency | < 100 ms | not measured (needs a driven browser) |
| Cold start to dashboard | < 2 s | not measured (needs a driven browser) |
| Dashboard aggregate query | < 30 ms | **0.9–1.4 s** |
| Breakdown by category (12 months) | < 100 ms | **1.5–1.9 s** |
| Monthly series (24 months) | < 100 ms | **1.0–2.0 s** |
| Rollup rebuild (all rows) | < 10 s | 4.6–4.9 s |
| Transaction list first paint | < 300 ms | not measured |
| Mortgage amortization (3 tracks, 30y) | < 200 ms | 11 ms |

## Where the gate stands

`npm run test:budget` seeds a real 50k-row encrypted database and times the
engine functions, median of three runs after a warm-up. It replaced a check that
compared two hand-written constants and could never fail.

Ceilings are ~3x the slowest local figure: repeated runs on the owner's machine
already vary by 2x and a CI runner is slower, so a tight gate would only be
flaky. This catches an algorithmic regression, not a few hundred milliseconds.

The browser metrics were dropped from the gate rather than faked. They stay as
targets and are checked by hand.

## Mechanisms

- Materialized `rollup_monthly` for both date bases
- Covering indexes on filter dimensions
- TanStack Virtual for lists
- Server Components for static shell
- Net worth reads one `accounts.balance_ils` per account, not raw scrape copies (add-on 0.1.5)

## Known full-table scans in the engine

Several post-process steps still `select().from(transactions).all()` and filter in
JS: `processRefunds`, `processSettlementMatching`, `processInternalTransfers`,
`processCardSettlements`, and `retagKinds` in the repair script. Fine at the
current ~1.2k rows, well outside target at 50k.

The 2026-09-15 measurements confirm it quantitatively: the dashboard aggregate is
roughly 40x its target. `selectAnalysisTransactions` is the first thing to fix —
push the date, scope and dimension predicates into SQL instead of reading rows
and filtering them in JS. Tracked as SEC-009b in the audit report.

`recomputeRollups` is already scoped to dirty periods — do not regress that.
