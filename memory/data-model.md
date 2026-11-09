---
topic: data-model
tags: [v2, schema, sqlite]
last_updated: 2026-11-08
status: active
owns:
  - packages/db/**
  - packages/contracts/src/schema.ts
---

# Data Model (MEM-DATA)

## Principles

1. Raw data is immutable (append-only `raw_transactions`, `scrape_runs`).
2. Derived data is recomputable; every derivation records why.
3. Human decisions are never overwritten by automation (`categorization_decisions`).

## Key tables

| Area | Tables |
|------|--------|
| Raw landing | `scrape_runs`, `raw_transactions`, `raw_accounts` |
| Identity | `people`, `users`, `sessions`, `login_attempts`, `audit_log` — person merge (`POST /api/people/:id/merge`, `server/people-merge.ts`) re-points `users.person_id`, `accounts.owner_person_id`, `cards.cardholder_person_id`, `salary_sources.person_id`, rebuilds `rollup_monthly` and deletes the source in one transaction; a new person-id column must be added there |
| Accounts | `connections`, `accounts`, `cards` |
| Transactions | `transactions` (+ `provider_category` from MAX scraper category), `transaction_revisions`, `purchases`, `transaction_links` |
| Categorization | `merchants`, `categories`, `tags`, `categorization_decisions`, `provider_category_map` (18 seeded MAX labels → `category_id`, nullable = leave uncategorized), … |
| Salaries | `salary_sources` (migration `0006`) — user-defined matchers (`merchant_id`, `match_pattern`, optional `account_id`/`person_id`) for the dashboard inner income ring |
| Loans | `loans`, `loan_tracks`, `loan_schedule_rows` |
| Ops | `jobs`, `rollup_monthly`, `egress_log` |

## Transaction identity

`identity_hash = sha256(provider_code | account_number | transaction_date | original_amount | original_currency | normalized_description | installment_index)`

Repeats in one ingest batch (`ingestRows`: a sync account, or one statement (card, charge month)) share that base, since `original_amount` is absolute and direction separate: `discriminateOccurrences` (`packages/ingest/src/identity.ts`) orders them debit first, then charge date, then provider order; the 1st keeps the base (pre-fix rows still match), the n-th gets `sha256(base#n)`.

Scraper `identifier` is secondary only — optional, type-inconsistent, non-unique for installments.

Provenance (migration `0011`): `transactions.source` is `sync` (scraper, manual, all older rows) or `file` (card statement upload, `packages/ingest/src/statement-import.ts`, scrape run status `imported`, library `statement-file/1`); per (card account, charge month) a file upload replaces earlier file rows and skips months holding any sync row, and a sync whose window fully covers the month removes the file rows it did not match.

## HA household users (migration `0008_ha_user_pin`)

`users.ha_user_id` (unique), `pin_hash`, `pin_failed_count`, `pin_locked_at` bind app sessions to Home Assistant ingress identity. Password hash is unused for daily login in add-on mode except as a placeholder after peer reset. Keyslots live in `/data/keyslots.json` (not in SQLite).

## Account scope (migration `0005`)

`accounts.scope` is `household` (default) or `business`. A business account is
outside every household total: `selectAnalysisTransactions` and the
`GET /api/transactions` list both fall back to household-only whenever the caller
does not name `accountIds`. Naming the account explicitly bypasses the filter, so
the entity page `/entities/account/<id>` is the business account's own dashboard.
`AnalysisFilter.accountScope` can ask for `business` or `all` instead.

`accounts.balance_ils` / `balance_date` are refreshed on every sync from the
scraper snapshot. Net worth and dashboards read these columns, not `raw_accounts`.

## Retention (daily agent prune)

| Data | Policy |
|------|--------|
| Raw scrape copies | Per connection: keep the newest `scrape_runs.status = success` plus any `running` / `otp_required` run; delete all other runs and their `raw_transactions` / `raw_accounts`. Null `transactions.first_seen_raw_id` before deleting raw rows. |
| Sync window | When no explicit `startDate`: fetch from last success minus 60 days, floored at 365 days; first sync pulls 365 days. |
| DB file | After prune, `VACUUM` when `freelist_count / page_count > 0.2` (skipped while a scrape job is `running`), then `wal_checkpoint(TRUNCATE)`. |
| Logs | `audit_log`, `login_attempts`, `transaction_revisions`: 90 days. |
| Categorization history | Keep every manual decision plus the newest automated decision per transaction. |
| Finished jobs | 30 days for `done` / `failed`. |
| Sessions | Delete rows with `expires_at` in the past. |
| Forever | Normalized `transactions`, rules, categories, holdings, loan schedules, one `net_worth_snapshots` row per `as_of`, manual categorization decisions. |

Chromium profile under `/data/puppeteer/**` is excluded from backups; `--disk-cache-size=33554432` caps cache growth.

## System categories (migration `0009_system_categories`)

Three seeded categories with fixed ids, each skipped when the user already has a same-named category under the same parent: credit-card bills of unconnected cards (`…0c3`, top level), loan and mortgage repayments (`…043`, under `…040`), taxes and fees (`…0d0`, top level). Names are Hebrew in the migration.

The same migration queues one `categorize_bulk` job over all periods, newest first, when transactions exist and no such job is queued or running.

Bank-row kinds (`resolveTransactionKind`, `packages/engine/src/transaction-kind.ts`): mortgage debits → `loan_payment`; whole-word pension, provident and study-fund words on debits → `transfer`. Credits skip both, so a pension annuity stays income.

## Connection status (derived)

`GET`/`POST`/`PATCH /api/connections` add `lastSuccessAt` (newest `scrape_runs.finished_at` with `status = success`) and `credentialsSet` (MEM-SEC). Both are computed per request by `loadConnectionStatuses`, not stored.

## Date basis

Both `transaction_date` and `charge_date` stored. `rollup_monthly` materialized for both `transaction` and `charge` bases.

## Income drill-down filter

`AnalysisFilter.salaryScope` (`uuid` | `"other"`) scopes income rows by salary-source match (`matchSalarySourceId` in `packages/engine/src/salary.ts`). `"other"` means income with no matching `salary_sources` row (the הכנסות אחרות ring slice). Applied in `selectAnalysisTransactions` and `GET /api/transactions` (id-set SQL). List-only `kinds` stays on `TransactionListQuerySchema`, not `AnalysisFilter`.
