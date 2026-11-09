---
topic: architecture
tags: [v2, monorepo, processes]
last_updated: 2026-11-09
status: active
owns:
  - apps/**
  - packages/**
  - tsconfig*.json
  - package.json
---

# Architecture (MEM-ARCH)

## Overview

Two processes, one encrypted SQLite database, zero inter-process network surface.

- **apps/web** — Next.js 16.2.11 App Router, binds `127.0.0.1:3100` only. Remote access via Tailscale Serve on Windows dev; via Home Assistant Ingress in add-on mode.
- **apps/agent** — Opens shared encrypted DB, no HTTP listener. Logs `agent ready` (Phase 1); job polling in Phase 2.
- **packages/db** — Drizzle ORM over SQLCipher (`better-sqlite3-multiple-ciphers` 13.0.3). In-process `migrate()`, not drizzle-kit push.
- **packages/vault** — Windows Credential Manager for master DB key in dev; file-backed AES-GCM secrets under `/data/secrets` in HA add-on mode (ADR-007).
- **packages/egress** — Outbound HTTP allowlist + undici global interceptor.
- **packages/crypto** — AES-256-GCM helpers for future TOTP/credential payloads.
- **packages/contracts** — Frozen Zod schemas + internal REST API contract.
- **packages/engine** — Financial post-process (installments, settlements, transfers, refunds, FX, rollups).
- **packages/classify** — Deterministic categorization pipeline.
- **packages/market** — Reference data refreshers (BOI, CPI, FX, funds).

## Analysis (Phase 4, partial)

- Filter state: `AnalysisFilter` serialized in URL via `apps/web/src/lib/analysis-filter.ts`.
- API: `POST /api/analysis/breakdown` returns dimension breakdown; `GET /api/analysis/categories/[categoryId]` returns month summary + insights.
- UI: `/analysis` donut chart (Recharts); category slice click → `/categories/[categoryId]?period=YYYY-MM` (merchant donut, monthly bars, transactions, insights).
- `analysis-filter.ts` expands `categoryIds` to all descendants before `inArray` — parent filters include child-category transactions.

## Monorepo layout

```
apps/web          UI + auth API routes
apps/agent        background process (no port)
packages/contracts  Zod types + API contract
packages/db       Drizzle schema + encrypted connection + guards
packages/vault    Credential Manager
packages/egress   outbound allowlist
packages/crypto   AES-256-GCM helpers
```

## Data flow (Phase 1)

1. Process starts → startup guards → `initDb()` → vault loads/creates 32-byte key → open SQLCipher → `runMigrations()`.
2. Web: auth routes use Argon2id + DB-backed sessions; Edge middleware guards app pages by cookie; API handlers use `guardApi()`.
3. Agent: same DB path, egress guard installed, no listener.

## Home Assistant add-on (`MONEYTRACK_MODE=ha-addon`)

Single container, same two Node processes as Windows — still no agent HTTP listener.

```
Supervisor ingress (172.30.32.2) → nginx :8099 → Next.js 127.0.0.1:3100
                                 ↘ s6 runs agent (polls DB jobs)
```

- **nginx** is the only external listener; it allows only the Supervisor address and forwards `X-Remote-User-Id` / ingress path headers set by HA (not the client).
- **Base path:** Next standalone build uses a placeholder ingress prefix; `ha-addon/moneytrack/scripts/apply-base-path.mjs` replaces only the `__MONEYTRACK_INGRESS_TOKEN__` token at start from Supervisor `ingress_entry` (Next also stores the prefix regex-escaped in the middleware matcher). Every literal copy of the placeholder is rewritten, so no runtime code may compare against `INGRESS_BASE_PLACEHOLDER`.
- **Build:** root `npm run build` is `tsc -b` (packages and agent in project-reference order) then `next build`; workspace-order builds compile apps before the packages they import. The standalone tree omits `packages/db/drizzle`, which the bundled `@moneytrack/db` resolves from the standalone root, so the Dockerfile copies it in.
- **UI copy:** new Hebrew strings go in `apps/web/src/locales/he.json` (imported directly, listed in the web `tsconfig` `include`); first used for the HA passphrase checklist. Older screens still inline Hebrew and have not been migrated.
- **Packaging:** add-on metadata in `ha-addon/moneytrack/`; store repo pointer in root `repository.yaml`. Image published to GHCR (Track C workflow). s6 scripts use `#!/usr/bin/with-contenv bashio` (s6-overlay v3 in `base-debian:bookworm`).

## Sync scheduling and staleness (2026-11-04)

- **Nightly auto-sync:** `apps/agent/src/sync-schedule.ts` runs at the start of `processQueuedJobs` each tick. Between 02:00 and 05:00 Asia/Jerusalem it enqueues one `scrape` job per enabled connection that has a vault secret, no live scrape job, and no scrape job (any status) created in the last 20 h. The 20 h rule is the bank-lockout guard: a failed nightly attempt is never retried the same night. `connections.schedule_cron` stays unused.
- **Visibility:** `GET /api/connections` adds `lastSuccessAt` (newest successful `scrape_runs.finishedAt`) and `credentialsSet` (vault probe, never returned). A missing secret fails the job as `CREDENTIALS_MISSING`. `components/sync/stale-data-banner.tsx` in `app-shell.tsx` warns on every page except Accounts when nothing synced in 3 days or a connection never synced / lacks credentials.
- **Period:** the global month lives in `sessionStorage` (`mt-period`), so a fresh open is the current month; the default date basis is `charge` (`DEFAULT_DATE_BASIS` in `@moneytrack/contracts`, since 2026-11-04 evening); purchase month is an explicit opt-in (credit switch, analysis toggle).
- **Credit page:** `/credit` reads the global period (listed in `PERIOD_AWARE_PREFIXES`); `credit-monthly-chart.tsx` draws 12 stacked months (top 5 top-level categories + other) from `POST /api/analysis/trend` with the page basis and card filter; month totals sit on a transparent anchor bar of value 1 (a zero-value Recharts bar renders no label). Month selection uses the BarChart-level onClick (`periodFromChartClick`, whole column) and scrolls to `#credit-page-top`; the chart keeps its own 12-month window. The chart switches category/person/card via `POST /api/analysis/trend?dimension=` (`queryCategoryTrend(db, filter, dimension)`; segment id/name fields carry the person or card for those modes).
- **Statement upload:** `POST /api/connections/[id]/statement` (isracard/amex, multipart "file", 2 MB) -> `parseStatementFile` (ingest) -> `parseIsracardStatement` (providers, stdlib zip/XML reader, scraper-shaped output, local-midnight dates for identity parity) -> `importStatementFile`: per (card last4, charge month) replace file rows, skip months with sync rows, one DB transaction; sync later takes over file months it fully covers. Provenance in `transactions.source` (sync|file, migration 0011); import runs are `scrape_runs` with status `imported`, library `statement-file/1`.
- **Bank page:** `/bank` mirrors `/credit` for bank accounts (period-aware, compact rows, drawer); card bill rows (`card_settlement`) are read-only for categories everywhere.
- **Session expiry:** `use-session-expiry.ts` (mounted in `app-shell.tsx`) wraps `window.fetch`; any same-origin `/api/` 401 outside `/ha/`, `/login`, `/change-password` reloads the page once so the server gate shows PIN/unlock. Without it an open page after an idle timeout or add-on restart showed empty states (accounts said "no connections").

## Rejected alternatives

- Postgres: unnecessary for single-machine workload.
- HTTP worker (v1): replaced by DB job queue.
- `drizzle-kit push` on encrypted DB: unsupported; use `generate` + in-process `migrate()`.
