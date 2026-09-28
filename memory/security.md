---
topic: security
tags: [v2, threat-model, encryption, asvs]
last_updated: 2026-09-28
status: active
owns:
  - packages/vault/**
  - packages/egress/**
  - packages/crypto/**
  - packages/db/src/guards.ts
  - packages/db/src/connection.ts
  - packages/db/src/encryption-at-rest.test.ts
  - apps/web/src/middleware.ts
  - apps/web/src/server/**
  - apps/web/src/app/api/auth/**
  - scripts/seed-admin.ts
  - .gitleaks.toml
  - .pre-commit-config.yaml
  - docs/backup-restore.md
  - docs/verify-binding.md
---

# Security (MEM-SEC)

## Threat model

**In scope:** stolen disk/backup, other users on machine, LAN attacker, tailnet without app credentials, compromised npm deps, adversarial merchant names.

**HA add-on (extends model):**

- **HA host / privileged add-ons:** while the DB key sits in `/dev/shm`, root on the host or add-ons with `full_access` / `docker_api` / SSH with protection off could read process memory. Mitigation: documented audit list + in-app system check warning (not a crypto fix).
- **HA backups and cloud sync:** full `/data` backups include SQLCipher DB and `keyslots.json`; ciphertext is useless without passphrase or recovery key, but metadata and timing leak. `puppeteer/` and `logs/` excluded from hot backup.
- **Ingress trust boundary:** app identity in add-on mode trusts `X-Remote-User-Id` only because nginx admits Supervisor (`172.30.32.2`) alone; client-supplied ingress headers are stripped upstream. Sessions bind to HA user id; allowlist in add-on Configuration (`allowed_users`).
- **Other HA users:** kids or guests with HA logins but not on the allowlist get `no_access`; household MFA on HA does not replace per-user PIN/passphrase (ADR-008).
- **Pre-unlock surface:** HA status, gates and the API guard decide from `keyslots.json` + the shm key without opening the DB (`ha-auth.ts`, `ha-vault.ts`). First enrollment is serialized in-process and creates `keyslots.json` exclusively (`linkSync`), so a race or replay cannot replace the vault key. Passphrase and recovery-key attempts are throttled in memory per HA user (5 per 15 minutes; a restart resets it — the attacker still needs HA login + allowlist). Audit: `ha_vault_created`, `ha_enroll`, `ha_unlock`, `ha_unlock_failed`, `ha_recovery_unlock`, `ha_recovery_failed` (failures are only written when the DB is already open).
- **Master passphrase rule** (owner, 2026-09-28, add-on 0.1.3): min 8 with ASCII lower + upper, digit and special, max 256 (bounds Argon2id input), no trim, plus the `checkPassword` denylist and username check; enforced server-side by `checkHaPassphrase()` (ADR-008). Below ASVS V2.1.1's 12 by owner choice; the offline passphrase guess still costs an Argon2id KEK derivation per try. No denylist entry has all four classes, so since add-on 0.1.4 `ha-passphrase-denylist.ts` (HA only) also compares every stage of peeling leading/trailing digit and symbol runs, plus a leetspeak variant (`@0 1 3 $` → `a o i/l e s`), candidates of 4+ characters, against the denylist, `APP_TERMS` and the HA username: `Password1!`, `!Qwerty123`, `P@ssw0rd#9`, `M0neyTrack!7` are refused. Desktop `checkPassword()` is unchanged. UI calls it "master password" (Hebrew copy in `he.json`); code and API keep "passphrase".
- **Scraper isolation:** Chromium runs with `--no-sandbox` in the add-on (agent is root in the container), so the container plus `ha-addon/moneytrack/apparmor.txt` are the only boundary around bank-site content. The profile follows HA's template (`file,` plus explicit exec rules for s6, nginx, `/usr/local/bin/node`, chromium) and is untested on-device; tighten it via complain mode + `journalctl _TRANSPORT="audit"` after acceptance.

**Out of scope (documented honestly):** malware running as the same Windows user. DPAPI protects against stolen disks and other users, not same-user processes. Same-user memory read on the HA host is accepted residual risk while unlocked.

## OWASP ASVS 5.0 Level 2 mapping

Target: **ASVS L2**. Waived items are explicit compensating controls or accepted v2 scope cuts.

| ASVS ID | Requirement (summary) | How satisfied | Test / proof |
|---------|----------------------|---------------|--------------|
| V2.1.1 | Password length ≥ 12 | `MIN_PASSWORD_LENGTH` is **8**, not 12 | **Gap** — raising it rejects the owner's current password at login, so it needs a password change first |
| V2.1.2 | Breached password check | `checkPassword()` denylist, 2087 entries, fully offline | `packages/crypto/src/password-policy.test.ts` |
| V2.1.3 | Password recovery | Admin reset script prints a fresh random password | Manual procedure |
| V2.2.1 | Anti-automation | Rate limit 5/15min + 15min lockout | `apps/web/src/server/auth-security.test.ts` |
| V2.2.2 | Weak password deny | Zod min length + common-password denylist + username/app-name similarity | contracts + `password-policy.test.ts` |
| V2.3.1 | Session tokens ≥ 128-bit | 256-bit random, SHA-256 at rest | `auth-security.test.ts` |
| V2.3.2 | Cookie flags | httpOnly + Secure + SameSite=Strict | `sessionCookieOptions()` test |
| V2.3.3 | Session termination | Logout + password change invalidate | `auth-security.test.ts` |
| V2.3.4 | Session idle/absolute timeout | 30 min idle, 7 day absolute | `auth.ts` constants |
| V2.4.1 | MFA | Dev: waived (Tailscale). HA add-on: HA login + MFA at ingress, plus per-user PIN + master passphrase (ADR-008) | `ha-auth.test.ts`, on-device checklist |
| V2.5.1 | Re-auth for sensitive ops | Password change requires current password | `/api/auth/password` |
| V2.7.1 | Crypto keys managed | Windows Credential Manager + SQLCipher raw key | `encryption-at-rest.test.ts` |
| V2.8.1 | Sensitive data at rest | SQLCipher, temp_store=MEMORY | encryption tests |
| V3.3.1 | Output encoding | React default; CSV formula prefix | `adversarial-merchant.test.ts` |
| V3.4.1 | Injection prevention | Drizzle parameterized; ESLint SQL ban | semgrep + code review |
| V3.5.1 | SSRF prevention | Egress allowlist + undici guard | `egress-integration.test.ts` |
| V4.1.1 | Access control enforced | `guardApi()` on all data routes | route grep + auth tests |
| V4.2.1 | Deny by default | Server layouts verify the session against the DB; middleware fast-redirect; API 401 | `middleware.test.ts` + guard-api |
| V7.1.1 | Security logging | `audit_log` login/export/lockout | schema + login route |
| V7.2.1 | No secrets in logs | `redactLogMessage()` on every scrape error before storage | `log-redaction.test.ts` |
| V8.1.1 | HTTP security headers | CSP, HSTS, XFO, etc. | `next.config.ts` |
| V8.2.1 | CSP | Strict CSP; theme via external `/theme-init.js` | layout + config |
| V9.1.1 | TLS | Tailscale Serve HTTPS to loopback | `docs/verify-binding.md` |
| V10.3.1 | Malicious code in deps | npm audit high, gitleaks, lockfile | CI jobs |
| V14.2.1 | Dependency pinning | exact versions + lockfile | `package-lock.json` |

## Phase 1–6 — implemented

### Data at rest

- SQLite encrypted with `PRAGMA cipher='sqlcipher'`, raw 32-byte key via `db.key(Buffer)` (no PBKDF2).
- **Windows dev:** master key in Credential Manager (`@napi-rs/keyring`, target `moneytrack/master-db-key`).
- **HA add-on:** 32-byte DB key wrapped in `/data/keyslots.json` (per-user Argon2id KEK + recovery slot); unlocked key in `/dev/shm/moneytrack-db.key` (mode `0600`) after passphrase; bank secrets in `/data/secrets/` via file vault (ADR-007).
- `journal_mode=WAL`, `temp_store=MEMORY`.
- Default data dir: `C:\MoneyTrack\data` (never in repo or cloud-sync folders).

### Startup guards (`packages/db/src/guards.ts`)

- Refuses cloud-sync paths (OneDrive, Dropbox, Google Drive, iCloud).
- Refuses data dir inside a git work tree.
- Refuses web bind on `0.0.0.0` / `::`.
- **BitLocker:** fails in `NODE_ENV=production` when off; warns in development.

### Authentication

- Argon2id (`memoryCost=65536`, `timeCost=3`, `parallelism=4`).
- 256-bit session tokens, SHA-256 hashed at rest.
- Cookie `mt_session`: `httpOnly`, `Secure` (disable with `MONEYTRACK_INSECURE_COOKIES=1` for local HTTP dev), `SameSite=Strict`.
- Idle timeout 30 min (sliding), absolute max 7 days.
- Rate limit: 5 failures / 15 min → 15 min lockout (`login_attempts` table).
- New passwords pass `checkPassword()` from `@moneytrack/crypto`: rejected if on the bundled common-password denylist, or if built out of the username or the app name. Checked only after the current password proves identity, so the list cannot be probed with a stolen cookie alone.
- Edge middleware: cookie presence only — the Edge runtime cannot reach the encrypted DB. Real verification lives in `(app)/layout.tsx` and `(auth)/change-password/layout.tsx`, which call `getSessionUser()` per render. A page added to one must be added to the other.
- API routes (`runtime=nodejs`): `guardApi()` verifies session against DB on every protected handler.
- CSRF: `Origin` must match `Host` on mutating methods.
- `POST /api/sync`: connection must exist; one live scrape job per connection (`apps/web/src/server/sync-guard.ts`, 30 min staleness window) so a stolen session cannot amplify into repeated bank logins.
- `totp_secret_encrypted` column present, unused in v2.

### Egress

- Single module: `packages/egress` with `egressFetch` + undici global `AllowlistAgent`.
- Allowlist: `boi.org.il`, `edge.boi.gov.il`, `api.cbs.gov.il`, `data.gov.il`, `api.frankfurter.dev`, `query1.finance.yahoo.com`.
- ESLint bans bare `fetch` outside `packages/egress` (web client same-origin exempt).

### Headers (next.config.ts)

CSP with `'self'` scripts; theme bootstrap loaded from `/theme-init.js` (no inline script). HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options`.

## Phase 7 — verification

- Automated tests: `encryption-at-rest.test.ts`, `egress-integration.test.ts`, `adversarial-merchant.test.ts`, `auth-security.test.ts`, `log-redaction.test.ts`, `password-policy.test.ts`.
- CI gates: typecheck, lint, test, memory-drift, gitleaks (`.gitleaks.toml` Israeli PII rules), npm audit gate, semgrep, CodeQL, performance budget, backup/restore drill.
- npm audit gate (2026-09-27): `scripts/security/audit-gate.mjs` fails on high/critical advisories except those in `security/audit-accepted.json`, and on any acceptance past its `reviewBy`. Accepted: both `extract-zip` GHSAs (via `israeli-bank-scrapers` → puppeteer 24 → `@puppeteer/browsers` 2.13.2, install-time unzip of Google's Chrome build only), review by 2026-12-26. An `overrides` to `@puppeteer/browsers` 3.2.2 was rejected: puppeteer 24 pins 2.13.2 exactly and 3.x is an ESM-only major loaded through puppeteer-core's CJS build. Clears when the scraper moves to puppeteer 25.
- AES-GCM decrypt pins `authTagLength: 16` (semgrep `gcm-no-tag-length`); every blob is written by `encrypt()` with the default 16-byte tag and read as a fixed 16-byte slice, so stored data is unaffected.
- CodeQL enabled — free once the repository is public (2026-09-15); semgrep stays alongside it.
- Pre-commit: `.pre-commit-config.yaml` runs `gitleaks protect --staged`.
- Written audit: `memory/security-audit-2026-08.md`.

### Egress manual drill log

| Date | Operator | Result | Notes |
|------|----------|--------|-------|
| _pending_ | — | — | Run after first production sync; diff hosts vs `egress_log` |

## Credentials

Bank credentials: Windows Credential Manager via `@moneytrack/vault`. Database stores `credential_ref` only.

Entered through `PUT /api/connections/:id/credentials` (write-only, no GET). The route rejects any field set that does not exactly match the provider's `loginFields`, and the audit entry records field *names* only. Secret values must never reach a response schema, the audit log, or SQLite.

## First-run admin

`npm run seed:admin` creates user `admin` with `must_change_password=true` and a
**random** temporary password printed once to stdout. Never reintroduce a constant
here: the source is public, so a fixed default is a published credential, and
`must_change_password` does not help if a stranger reaches the login first.
`npm run reset:admin-password` behaves the same unless `MONEYTRACK_NEW_PASSWORD`
is supplied, which is itself checked against the denylist. No real email addresses.

## Backup / restore

See [docs/backup-restore.md](../docs/backup-restore.md). Quarterly production drill → `memory/lessons.md`.

## Binding verification

See [docs/verify-binding.md](../docs/verify-binding.md).
