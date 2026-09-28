---
topic: market
tags: [v2, reference-data, phase5]
last_updated: 2026-08-25
status: active
owns:
  - packages/market/**
---

# Reference Data / Market (MEM-MARKET)

Phase 5 reference refreshers in `packages/market/`. All outbound HTTP via `@moneytrack/egress` only.

## Sources

| Series | Source | Notes |
|--------|--------|-------|
| `boi_rate`, `prime` | `boi.org.il/PublicApi/GetInterest` | Prime = BOI + `PRIME_SPREAD` (1.5%, config) |
| `cpi_general`, `cpi_yoy` | `api.cbs.gov.il/index/data/price?id=120010&coef=true` | Index level + YoY %; published ~15th 18:30 IST |
| `fx_*_ils` | `boi.org.il/PublicApi/GetExchangeRates` | `unit` field handles per-100 JPY; frankfurter.dev fallback |
| `fund_gemel_*`, `fund_pensia_*` | data.gov.il CKAN datastore | Net yield = trailing 3y gross − `AVG_ANNUAL_MANAGEMENT_FEE` |
| Securities (stub) | `query1.finance.yahoo.com` | **Unofficial** TASE fallback; ILA/agorot ÷ 100 |

## Storage

- Rates and fund yields → `reference_series` + `reference_observations`.
- Securities stub returns a quote object only (no DB write until holdings wiring).

## Loan rate helper

`computeEffectiveRate(rateType, margin, fixedRate, { prime, cpi })` supports `fixed`, `prime_linked`/`prime_plus`, `cpi_linked_variable`/`cpi_plus`, and `cpi_linked_fixed` (fixed component only).

## Agent schedule

- **Daily:** `refreshBoi` + `refreshFx` (once per calendar day).
- **Monthly CPI window:** days 13–20, retry until current month observation exists.
- **On demand:** `jobs.kind = reference_refresh` runs full refresh (BOI, FX, CPI, funds).

## Tests

`packages/market/src/market.test.ts` — mocked fetch responses, no live network in CI.
