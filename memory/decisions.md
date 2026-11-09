---
topic: decisions
tags: [v2, adr]
last_updated: 2026-09-28
status: active
owns:
  - memory/decisions.md
---

# Architecture Decision Records (MEM-ADR)

Append-only log. New ADRs require sequential ID.

---

## ADR-001: SQLite with SQLCipher over Postgres

**Status:** Accepted (Phase 0)

**Context:** Single-machine, single-digit-GB, read-heavy workload on always-on Windows PC.

**Decision:** SQLite via `better-sqlite3-multiple-ciphers` + Drizzle ORM. Encrypted with raw 32-byte key in Credential Manager.

**Rejected:** Postgres (second service, network hop, no benefit at scale); libsql/Turso (beta Drizzle support); `@journeyapps/sqlcipher` (no Windows).

---

## ADR-002: Branch strategy — v2/develop replaces master

**Status:** Accepted (Phase 0)

**Context:** v1 on `master` does not meet v2 requirements. Clean rewrite on same repo.

**Decision:** All v2 work on `v2/develop`. Eventually promotes over `master`. Never push to `main`/`master` during development.

**Rejected:** New repository (loses history); in-place rewrite on master (blocks v1 hotfixes).

---

## ADR-003: No app-level TOTP in v2

**Status:** Accepted (Phase 0)

**Context:** User decision. Compensating controls required.

**Decision:** No TOTP UI in v2. Schema includes `totp_secret_encrypted` nullable column for zero-cost future enablement. Compensating: Argon2id, rate limiting, session hardening, audit log, Tailscale ACLs.

**Rejected:** Mandatory TOTP (explicitly out of scope); removing TOTP column entirely (would require migration later).

---

## ADR-004: Hebrew RTL only, no language toggle

**Status:** Accepted (Phase 0)

**Context:** Household app for Israeli users only.

**Decision:** `<html dir="rtl" lang="he">`. All UI strings in Hebrew. Logical Tailwind properties. Charts in LTR wrapper. No i18n framework.

**Rejected:** Multi-language support (YAGNI); English UI with Hebrew data.

---

## ADR-005: Contract-first development

**Status:** Accepted (Phase 0)

**Context:** Eight parallel workstreams need stable boundaries.

**Decision:** Freeze Zod schemas + API contract + Drizzle schema in Phase 0. Tag `contracts-v0.1.0`. Later changes require ADR + coordinated PR.

**Rejected:** Implement-first-refactor-later (causes integration thrash between workstreams).

---

## ADR-006: Publish as a fresh public repository, do not rewrite history

**Status:** Accepted (2026-09-15, owner decision)

**Context:** Owner wants to share the project publicly. GitHub visibility is per
repository, not per branch, so a private-history/public-branch split is not
possible. The existing history carries a work email address on 16 of 24 commits
and the pre-scrub versions of files that held a real account number and household
names.

**Decision:** Scrub the working tree, close every open audit finding, then push
the result as a new public repository with a single clean commit. The existing
private repository keeps its full history. Commit author is the GitHub noreply
address.

**Rejected:** `git filter-repo` over the existing history (more moving parts and
more ways to leave a blob reachable than starting clean); adding the friend as a
collaborator on the private repo (does not meet the owner's goal of a public
project, though it was the recommended lower-risk option).

**Consequence:** Publishing tells an attacker how the app is built. Accepted:
the design holds no secrets, the app binds to loopback and is reached only over a
tailnet, and no default credentials remain in the source.

**Outcome:** Executed 2026-09-15. `ItamarVa/MoneyTrack-v2`, branch `main`, one
orphan commit, 440 files. Development continues on the private `origin`/`master`
only. Because the two repositories share no ancestor, every ordinary git
convenience between them — push, pull, merge — would undo the scrub. The
resulting rules and the refresh procedure are MEM-PUB, not this ADR.

---

## ADR-007: HA add-on deployment and key custody

**Status:** Accepted (2026-09-26)

**Context:** MoneyTrack moves from a Windows PC to a Home Assistant OS add-on. Windows Credential Manager is unavailable in the container; the DB must unlock after every restart without storing the raw key on disk.

**Decision:** Run web + agent in one `ghcr.io/home-assistant/base-debian:bookworm` image under s6. Persist `/data/moneytrack.db`, `/data/keyslots.json`, and file-vault secrets. Wrap the 32-byte SQLCipher key with AES-256-GCM per user passphrase (Argon2id KEK) plus a recovery-key slot. After unlock, write the raw key to `/dev/shm/moneytrack-db.key` (`0600`); agent polls until present. Bank credentials use `MONEYTRACK_VAULT=file` (HKDF from DB key). nginx fronts Next on `8099` for Supervisor ingress only.

**Rejected:** Storing the raw DB key on disk; sharing one Windows-style password for both users; building the image only on the HA device (CI → GHCR instead).

---

## ADR-008: HA identity, PIN, and master passphrase

**Status:** Accepted (2026-09-26)

**Context:** Ingress gives HA-authenticated users access. Household MFA on HA is strong for internet attackers but not for unlocked phones, other HA users, or stolen HA backups.

**Decision:** Trust `X-Remote-User-Id` only in `MONEYTRACK_MODE=ha-addon` behind nginx. Allowlist via add-on `allowed_users`. Daily use: 6-digit PIN with 15-minute idle relock. After every restart: each user's own master passphrase unwraps their keyslot; either enrolled user can unlock the household DB for both. Recovery: recovery key, peer reset from Settings (`POST /api/users/:id/reset`), or one-shot `clear_lockouts` in add-on config.

**ASVS V2.4.1:** App-level TOTP remains out of scope (ADR-003). In HA deployment, compensating controls are HA account MFA at ingress, per-user PIN, per-user passphrase, session binding to HA user id, audit log, and rate-limited passphrase attempts — documented in MEM-SEC instead of a blanket MFA waiver.

**Rejected:** WebAuthn/Face ID inside the add-on page (WKWebView limitation); a single shared household passphrase without per-user slots.

**Clarified (2026-09-27, add-on 0.1.2):** Phases resolve before the DB opens: not allowlisted → `no_access`; no `keyslots.json` → `enrollment_required`; no shm key → `vault_locked`. The first enrollment creates the keyslots file exclusively (never overwrites it, refuses if a DB exists without it) and shows the recovery key once; later users enroll only while the vault is unlocked. Passphrase slots carry the owner's `haUserId`. Five wrong PINs route to `vault_locked` (passphrase for that user). Passphrase attempts are throttled in memory (5 per 15 minutes per HA user), since failures happen before any DB exists.

**Amended (2026-09-28, add-on 0.1.3, owner decision):** Master passphrase rule is at least 8 characters with an ASCII lowercase letter, an ASCII uppercase letter, a digit and a special character (any non-letter, non-digit, space included; Hebrew letters have no case), at most 256 characters, no trim, plus the `checkPassword` denylist and username/app-name check. Replaces "min 12" from 0.1.2. Rule in `@moneytrack/contracts` (`missingHaPassphraseRequirements`), enforced by `checkHaPassphrase()` in `ha-vault.ts` on enrollment and recovery; the enroll and recovery pages show a live checklist. Unlock and PIN-change still accept any stored passphrase (schema min 8), so earlier passphrases keep working. Desktop login rule unchanged.

**Amended (2026-09-28, add-on 0.1.4, owner decision):** Users see the term "master password" (Hebrew copy in `apps/web/src/locales/he.json`) on every HA screen; API fields, error codes and identifiers keep "passphrase". The HA check adds a normalized denylist pass (`ha-passphrase-denylist.ts`: peel leading/trailing digit and symbol runs stage by stage, plus simple leetspeak, candidates of 4+ characters) against the denylist, app terms and the HA username. Desktop `checkPassword()` and the Windows export passphrase are unchanged.
