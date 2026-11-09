---
topic: ingestion-providers
tags: [v2, scraper, providers, phase2]
last_updated: 2026-11-08
status: active
owns:
  - packages/ingest/**
  - packages/providers/**
  - apps/agent/**
---

# Ingestion Providers (MEM-INGEST)

## Default library

`israeli-bank-scrapers@6.9.0` via `OfficialScraperAdapter` in `packages/providers/`. `ForkScraperAdapter` is a stub for a future `@sergienko4` swap.

## Provider catalog and credential entry

`PROVIDER_CATALOG` in `packages/contracts/src/providers.ts` lists every scrapeable institution with its `kind` (`bank`/`card`) and required `loginFields`. It duplicates `SCRAPERS` from the library on purpose — the web app must render a login form without importing puppeteer — and `packages/providers/src/providers.test.ts` fails if the two drift.

Credential flow: `POST /api/connections` (provider code validated against the catalog) → `PUT /api/connections/:id/credentials` writes the field JSON to the OS vault under `moneytrack/conn/<id>`. `ConnectionModal` on the accounts page drives both calls, and also re-writes secrets for an existing connection when a bank password changes. There is no GET for credentials.

## Provider interface

`ProviderAdapter.scrape(connection, credentials, options) => ScrapeResult` with `supportsOtp` and `companyId`. Scraper rows map to `RawTransactionPayload`; verbatim scraper JSON lands in `raw_transactions.payload_json`.

## Identity

`buildIdentityHash()` = sha256(`provider|account|date|amount|currency|normalized_desc|installment_index`). Scraper `identifier` is stored in the raw payload only — never the primary key.

## Sync pipeline (`packages/ingest/sync-runner.ts`)

1. Create `scrape_runs` row (`running`).
2. Scrape with `combineInstallments: false` always; `resolveSyncStartDate()` sets the window (365-day floor, last success minus 60 days when not overridden); `OfficialScraperAdapter` sets `outputData.enableTransactionsFilterByDate: false` so installment charges survive a shorter window.
3. Append `raw_accounts` + `raw_transactions` (dedupe on `run_id` + `payload_sha256`).
4. Upsert `transactions` on `identity_hash`; write `transaction_revisions` on change.
5. Pending→posted: match same normalized merchant + amount within ±5 days; merge instead of insert.
6. Per-account try/catch — one bad account does not abort the run.
7. Puppeteer profile: `C:\MoneyTrack\data\puppeteer\{connectionId}` (persisted on `connections.puppeteer_profile_dir`); Chromium args include `--disk-cache-size=33554432`.

## Error redaction (invariant)

`scrape_runs.error_message_redacted` is read back by the UI, and a Puppeteer
failure quotes whatever was on the page or in the login form. Everything written
to that column, and every operator log line derived from a scrape, goes through
`redactLogMessage(message, secrets)` in `packages/providers/src/redact.ts`. Pass
the credential values whenever the caller has them — pattern matching alone
cannot recognise an arbitrary bank password.

Until 2026-09-15 the `SCRAPE_EXCEPTION` path stored `error.message` verbatim and
`ingestAccount` wrote the full `providerAccountNumber`; the column name was the
only redaction (audit SEC-008). UUIDs are deliberately left intact — they are the
only handle an operator has on a failed run.

## Job queue

- Web enqueues `jobs` with `kind=scrape`, `payload_json={ connectionId }`.
- Agent polls every `AGENT_POLL_INTERVAL_MS` (default 60s), calls `processSyncJob`.
- OTP: agent sets `otp_required` + `otp_prompt`; UI `POST /api/sync/:id/otp`; agent resumes when `otp_response` is set.

## Nightly auto-sync (agent)

- `apps/agent/src/sync-schedule.ts` enqueues one `scrape` job per enabled connection that has a vault secret, between 02:00 and 05:00 Asia/Jerusalem (Intl zone, never the container TZ).
- No new job while the connection has a live job or any scrape job created in the last 20 h, failed ones included: a failing bank login is never retried the same night.
- `scheduleCron` is stored on the connection but the scheduler does not read it.
- A scrape job whose vault secret is missing fails with `errorClass` `CREDENTIALS_MISSING`; the nightly path skips such connections instead of enqueueing them.
- The agent logs every failed job (`job <id> (scrape) failed: ...`) instead of swallowing it.

**On-open sync (2026-11-04, owner requirement):** when the app opens and a connection has no successful sync for over 24 h, `StaleDataBanner` (via `useAutoSync`) calls `POST /api/sync/auto` once per browser session (sessionStorage flag), then polls `GET /api/sync/auto` every 5 s (max 10 min) and reloads the page on success. The due rules are shared with the nightly scheduler in `packages/ingest/src/sync-due.ts` (`evaluateSyncDue`, modes `nightly` / `on_open`): never within 20 h of any scrape job for the connection (failed included), never with a live job, never without a vault secret; skip reasons `disabled | fresh | credentials_missing | live_job | attempted_recently`. Manual "סנכרון" is unrestricted. A failed job row only says `SYNC_FAILED`; `GET /api/sync/auto` resolves the real class from the scrape run, and `components/sync/sync-error-messages.ts` maps classes (`INVALID_PASSWORD`, `CHANGE_PASSWORD`, `ACCOUNT_BLOCKED`, `TWO_FACTOR_RETRIEVER_MISSING`, `TIMEOUT`, `SCRAPE_EXCEPTION`, `NOT_IMPLEMENTED`, `CREDENTIALS_MISSING`, generic) to Hebrew what-happened/what-to-do text (`he.json` `autoSync`). Raw codes are never shown. The client must not import runtime values from `@moneytrack/ingest` (node-only code).

## API routes (Phase 2)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/sync` | Enqueue scrape job |
| GET | `/api/sync` | List scrape jobs |
| GET | `/api/sync/:id` | Poll single job |
| POST | `/api/sync/:id/otp` | Submit OTP |

All routes: `runtime = 'nodejs'`, guarded by `guardApi()`.

## Settlement (Phase 2 stub)

`looksLikeCardSettlement()` regex in `settlement.ts` tags `kind=card_settlement`. Full bank↔card linking is Phase 3.

## HA add-on scraper

Chromium runs from Debian `chromium` in the container; `PUPPETEER_EXECUTABLE_PATH` is set by the Dockerfile and the agent's s6 run script. In `MONEYTRACK_MODE=ha-addon` the official adapter adds `--no-sandbox --disable-dev-shm-usage`: the agent runs as root (Chromium refuses its sandbox there) and Docker's default 64 MB `/dev/shm` crashes renderers.

## Known constraints

- Bit and Paybox: no scraper — manual/CSV only (other workstream).
- Breakage is normal; per-provider isolation + manual import fallback.
- 2FA library hook: OneZero only; Hapoalim SMS mitigated by persistent Puppeteer profile.

## Test sync (dev)

1. Add the connection and its login fields from the accounts page (writes `credential_ref` → JSON in Credential Manager).
2. `POST /api/sync` with `{ "connectionId": "<uuid>" }` while logged in.
3. Agent running (`npm run dev:agent` or start launcher).
4. Poll `GET /api/sync/<jobId>` until `status` is `done` or `failed`; submit OTP via `/api/sync/<jobId>/otp` if `otp_required`.

## Statement files (2026-11-08)

Isracard/Amex `.xlsx` exports are parsed by `packages/providers/src/isracard-xlsx.ts` (stdlib reader `xlsx-reader.ts`: zip + `x:`-prefixed sheet XML, 10 MB / 200-entry caps) into the scraper shape, dates built as local midnight like the scraper for identity parity, pending "not yet posted" sections skipped. `packages/ingest/src/statement-import.ts` reconciles per (card last4, charge month); `transaction-cleanup.ts` deletes file rows with all dependents. A sync whose window starts on or before the first day of the previous month takes over file months: matched rows switch to `source = sync`, unmatched file rows are deleted.
