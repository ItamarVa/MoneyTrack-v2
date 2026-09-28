---
topic: invariants
tags: [v2, rules, enforcement]
last_updated: 2026-09-28
status: active
owns:
  - packages/contracts/**
  - scripts/memory/**
---

# Invariants (MEM-INV)

## Non-negotiable

1. Web binds loopback only (`127.0.0.1:3100` on Windows dev; same inside the HA container). Never `0.0.0.0` on the Next process. In add-on mode only nginx may listen externally, and only for the Supervisor ingress address.
2. Agent has no HTTP listener.
3. Runtime data never in repo or OneDrive.
4. Credentials never in DB, `.env`, logs, or job payloads.
5. Manual categorization never overwritten by automation.
6. Split amounts must sum to transaction amount (trigger + test, Phase 3).
7. Every transaction resolves to a card → cardholder (ingest fails loudly if not).
8. All outbound HTTP through egress allowlist (Phase 1).
9. Merchant names treated as attacker-controlled input everywhere.
10. Scrape error text passes `redactLogMessage()` before it is stored or logged — a Puppeteer message quotes the login form (MEM-INGEST).
11. A protected page added to `middleware.ts` must also sit under a layout that verifies the session against the DB; the Edge runtime cannot (MEM-SEC).
12. No fixed default password anywhere in the source — the repository is public (ADR-006).
13. In HA add-on mode no request path opens the DB before its key is in shm, and nothing overwrites `/data/keyslots.json` or `/data/moneytrack.db` during enrollment (ADR-008).
14. Nothing reaches the `public` remote except a freshly built orphan snapshot that passed the MEM-PUB pre-flight. Work stays on `origin`/`master`; no push, pull or merge crosses between the two.
15. Every path that sets an HA master passphrase (enrollment, recovery) calls `checkHaPassphrase()` before any keyslot or hash write; the client checklist is guidance only (ADR-008).

## Memory drift

CI enforces index link integrity + satellite staleness via `scripts/memory/check-drift.mjs`. Escape hatch: `[skip-memory]` commit trailer. With a single reachable commit (the public orphan snapshot, where every file carries the publish date) staleness is skipped and only link integrity runs; the full check runs locally on `master` (MEM-PUB step 2), since CI only triggers on the public repo.
