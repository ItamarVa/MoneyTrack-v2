---
topic: security-audit
tags: [v2, audit, phase-7, public-release]
last_updated: 2026-09-15
status: active
---

# Security audit — August 2026 (Phase 7), closed out September 2026

**Scope:** full `v2/develop` branch review per execution plan §11.2 and security-review workflow.  
**Reviewer:** Phase 7 agent (manual OWASP ASVS + codebase review).  
**Method:** static analysis, CI gate wiring, new security tests, grep for auth/egress/injection patterns.

## Executive summary

| Severity | Found | Fixed | Open |
|----------|-------|-------|------|
| Critical | 0 | 0 | 0 |
| High | 1 | 1 | 0 |
| Medium | 4 | 4 | 0 |
| Low | 5 | 5 | 0 |
| **Total** | **10** | **10** | **0** |

**Promotion gate:** no open findings. The six left open in August were closed on
2026-09-15 ahead of publishing the source publicly (owner decision, MEM-ADR).
SEC-003 keeps its waiver: application MFA is still not implemented and stays the
accepted residual risk, now with a real password denylist among its compensating
controls.

---

## Findings

### SEC-001 — High — CSP bypass via inline theme script — **Fixed**

| Field | Detail |
|-------|--------|
| Location | `apps/web/src/app/layout.tsx` |
| Issue | Inline `dangerouslySetInnerHTML` theme bootstrap conflicted with strict CSP (`script-src 'self' 'nonce-…'`) and bypassed nonce discipline. |
| Remediation | Moved script to self-hosted `/theme-init.js`; removed `dangerouslySetInnerHTML`. |
| Evidence | `apps/web/public/theme-init.js`, updated layout |

### SEC-002 — Medium — CI security gates non-blocking — **Fixed**

| Field | Detail |
|-------|--------|
| Location | `.github/workflows/ci.yml` |
| Issue | `lint`, `secret-scan`, and `npm-audit` used `continue-on-error: true`; audit level was `critical` only. |
| Remediation | Removed `continue-on-error`; `npm audit --audit-level=high`; added semgrep + performance budget jobs. |
| Evidence | Updated CI workflow |

### SEC-003 — Medium — No application MFA — **Waived**

| Field | Detail |
|-------|--------|
| Location | Auth layer |
| Issue | ASVS V2.4.1 MFA not implemented. |
| Remediation | Documented waiver with compensating controls (Argon2id, rate limit, short sessions, Tailscale ACLs, audit log). Schema retains `totp_secret_encrypted` for future enablement. |
| Evidence | `memory/decisions.md`, ASVS table in `memory/security.md` |

### SEC-004 — Medium — Edge middleware cookie-only check — **Fixed**

| Field | Detail |
|-------|--------|
| Location | `apps/web/src/middleware.ts` |
| Issue | Page routes check cookie presence, not DB session validity (Edge runtime limitation). Stale cookies may render shell until API calls fail. |
| Remediation | Verification moved to where the database is reachable rather than fought in the Edge runtime: `(app)/layout.tsx` and `(auth)/change-password/layout.tsx` call `getSessionUser()` on every render and redirect, so a stale cookie renders nothing. Middleware keeps only the fast-path redirect, and `PROTECTED_PREFIXES` was missing `/categories`, `/classify` and `/entities` — now complete and asserted. |
| Evidence | `apps/web/src/middleware.test.ts` (one case per protected prefix) |

### SEC-005 — Medium — Breached-password list not enforced — **Fixed**

| Field | Detail |
|-------|--------|
| Location | Password change, admin seed and reset |
| Issue | ASVS V2.1.2 local breached-password list not yet bundled. |
| Remediation | `checkPassword()` in `packages/crypto` rejects a new password that appears in a bundled denylist, or that is built out of the username or the app name. The list is the SecLists top ten thousand filtered to entries of at least `MIN_PASSWORD_LENGTH`, so every one of the 2087 entries is reachable; shorter entries are already refused by the zod schema. Fully offline: no HIBP range lookup, which would leak a hash prefix and is barred by the egress allowlist anyway. |
| Evidence | `packages/crypto/src/password-policy.test.ts`, `apps/web/src/app/api/auth/password/route.ts` |

### SEC-005b — Medium — Published default admin password — **Fixed**

| Field | Detail |
|-------|--------|
| Location | `scripts/seed-admin.mts`, `scripts/reset-admin-password.mts`, `scripts/smoke-pages.mts`, `scripts/ensure-env-secrets.ps1`, `scripts/start-dev.ps1` |
| Issue | Found while preparing the public release: both admin scripts seeded a fixed constant, `ensure-env-secrets.ps1` wrote a second fixed password into `.env` under a dead `AUTH_PASSWORD` variable, and `start-dev.ps1` printed that password plus a stale login address on every start. Harmless in a private repo, published default credentials in a public one — `must_change_password` does not help if a stranger logs in first. |
| Remediation | Both admin scripts generate a random temporary password and print it once. The smoke script no longer carries the constant as a fallback and creates its session through the database when `SMOKE_PASS` is unset. The dead `AUTH_PASSWORD` line is gone — nothing read it — and the launcher now points the operator at the seed script's one-time output instead of naming a password. |
| Evidence | `scripts/seed-admin.mts`, `scripts/reset-admin-password.mts`, `scripts/start-dev.ps1` |

### SEC-006 — Low — npm audit high severity — **Fixed**

| Field | Detail |
|-------|--------|
| Location | CI |
| Issue | Audit threshold too permissive. |
| Remediation | `--audit-level=high` enforced in CI. |
| Evidence | CI job |

### SEC-007 — Low — CodeQL not enabled — **Fixed**

| Field | Detail |
|-------|--------|
| Location | `.github/workflows/ci.yml` |
| Issue | CodeQL requires GitHub Advanced Security on private repositories. |
| Remediation | Going public makes CodeQL free, so the `if: false` guard is gone and the job runs `security-extended` alongside semgrep. |
| Evidence | `codeql` job in the CI workflow |

### SEC-008 — Low — Log redaction test incomplete — **Fixed**

| Field | Detail |
|-------|--------|
| Location | `packages/providers/src/redact.ts`, `packages/ingest/src/sync-runner.ts` |
| Issue | Recorded as a missing test, but the test was missing because the redaction was: `scrape_runs.error_message_redacted` received `error.message.slice(0, 500)` straight from a thrown Puppeteer exception on the `SCRAPE_EXCEPTION` path, and `ingestAccount` wrote the full `providerAccountNumber` into the same column. The column name was the only redaction. |
| Remediation | One `redactLogMessage(message, secrets)` used by both the adapter and the sync runner: exact credential values first, then sensitive `key=value` pairs, bearer tokens, opaque tokens of 32 characters or more, and digit runs of six or more reduced to their last four. Run and connection UUIDs are preserved deliberately, since they are the only handle an operator has on a failed sync. Replaces the adapter's old `\d{4,}` blanket rule, which could not recognise a password. |
| Evidence | `packages/ingest/src/log-redaction.test.ts` (11 cases, real function) |

### SEC-009 — Low — Performance budgets use placeholders — **Fixed**

| Field | Detail |
|-------|--------|
| Location | `scripts/benchmarks/run-budget-check.mjs` |
| Issue | CI compared `golden.placeholderMs` against `golden.budgetsMs` — two hand-written constants. Nothing was ever executed, so the gate could not fail. |
| Remediation | The script now seeds a 50k-transaction encrypted database and times `queryDashboardKpis`, `queryBreakdown` (category and merchant), `queryMonthlySeries`, `recomputeRollupsForAllTransactions` and a three-track 30-year mortgage schedule, taking the median of three runs after a warm-up. A budget without a measurement, or a measurement without a budget, now fails the job. The unmeasurable browser metrics were dropped from the gate rather than faked; they stay as targets in MEM-PERF. |
| Evidence | `performance-budget` job, `scripts/benchmarks/golden-budgets.json` |

### SEC-009b — Medium — Engine aggregates far outside their budget — **Open** (performance, not security)

| Field | Detail |
|-------|--------|
| Location | `packages/engine/src/analysis-filter.ts` and the rollup readers |
| Issue | Surfaced the moment SEC-009 started measuring. At 50k rows the dashboard aggregate takes 0.9-1.4s against a 30ms budget, and a rollup rebuild 4.6-4.9s. The cause is already recorded in MEM-PERF: the post-process steps and readers pull whole tables and filter in JS. |
| Remediation plan | Push the predicates into SQL, starting with `selectAnalysisTransactions`. Tracked as performance work, not a release blocker: the current household dataset is roughly 1.2k rows. |
| Target | Next performance sprint |

### SEC-010 — Low — Backup restore not CI-automated — **Fixed**

| Field | Detail |
|-------|--------|
| Location | `scripts/backup-restore-drill.mjs` |
| Issue | Restore drill documented but not executed in CI against synthetic DB. |
| Remediation | `npm run test:restore` walks the documented procedure against a throwaway encrypted database — seed, close, copy, wipe, restore, reopen with the same key — and compares row count and a spot-check row. Runs as its own CI job. A crash-consistent copy of a running database is a different drill and stays manual; after a clean close SQLite has checkpointed the WAL away. |
| Evidence | `restore-drill` job |

---

## Controls verified (no finding)

- All `/api/*` data routes call `guardApi()` except public auth endpoints (`login`, `logout`, `session`).
- Egress allowlist rejects non-listed hosts before network I/O (`egress-integration.test.ts`).
- SQLCipher marker/merchant/amount absent from raw bytes (`encryption-at-rest.test.ts`).
- CSV formula injection neutralized (`adversarial-merchant.test.ts`).
- Argon2id parameters, session entropy, lockout, cookie flags (`auth-security.test.ts`).
- No raw SQL string interpolation found; no `eval`/`Function` in application code.
- gitleaks custom rules for Israeli PII patterns (`.gitleaks.toml`).

---

## Re-test evidence

```text
npm run build && npm test
node scripts/memory/check-drift.mjs
node scripts/benchmarks/run-budget-check.mjs
```

Record commit hash and CI run URL after merge to `v2/develop`.

---

## Remaining risks (accepted for v2)

1. Same-user malware can read DPAPI-protected secrets (documented threat-model out-of-scope).
2. Scraper transmits credentials to bank sites only — inherent to function; egress allowlist prevents other destinations.
3. `better-sqlite3-multiple-ciphers` single-maintainer dependency.
4. Household-wide data visibility for all logged-in users (product decision).
5. No application MFA (SEC-003 waiver stands).
6. Publishing the source tells an attacker exactly how the app is built. Accepted:
   the design holds no secrets, the app binds to `127.0.0.1` and is reached only
   over a tailnet, and a published weakness is one the owner can also see.

---

## Public-release scrub (2026-09-15)

Owner asked what in the repository should not be shared before publishing. What
was found and removed from the working tree:

- A real provident-fund account number, branch numbers and two real statement
  amounts in `packages/engine/src/money-rules.test.ts`, whose own header admitted
  the strings were lifted from live statements. Wording kept, identifiers replaced.
- Household first names in `chart-fixtures.ts`, `salaries-panel.tsx` and
  `salary.test.ts`; the owner's employer as a merchant and salary descriptor.
- Two per-person temporary-password env vars in `scripts/ensure-env-secrets.ps1`
  whose names carried household first names. No code ever read them, so the lines
  went rather than being renamed.
- A Windows username in three `.cursor/rules/*.mdc` paths, now `%USERPROFILE%`.
- The published default admin password (SEC-005b above).

Deliberately kept: the Israeli provident and pension house names in
`savings.ts`, which are the functional core of the savings-move rule rather than
household data, and the merchant names used as negative test cases.

Not addressable in the working tree: the existing repository history carries a
work email address on 16 of 24 commits and the pre-scrub versions of the files
above. Hence the decision to publish a fresh repository with a single clean
commit rather than rewrite history (MEM-ADR).
