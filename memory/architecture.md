---
topic: architecture
tags: [v2, monorepo, processes]
last_updated: 2026-09-28
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

## Rejected alternatives

- Postgres: unnecessary for single-machine workload.
- HTTP worker (v1): replaced by DB job queue.
- `drizzle-kit push` on encrypted DB: unsupported; use `generate` + in-process `migrate()`.
