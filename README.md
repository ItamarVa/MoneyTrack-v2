# MoneyTrack v2

Local-first Hebrew RTL household finance app.

## Paths

Install root is the folder that contains `repo/`, `scripts/`, `data/`, and the `.bat` launchers (for example `...\MoneyTrack v2\`).

| Path | Purpose |
|------|---------|
| `<install>\repo` | Source code (this repo) |
| `<install>\data` | Runtime data (DB, puppeteer profiles) — never in repo |
| `<install>\Setup-MoneyTrack.bat` | First-time setup launcher |

Override data location with `MONEYTRACK_DATA_DIR`. For cloud-synced install folders (testing only), set `MONEYTRACK_ALLOW_CLOUD_DATA=1`.

## Branch

All v2 development on `v2/develop`. Contract freeze tagged `contracts-v0.1.0`.

## Development

Requires Node 24 LTS.

```bash
npm install
npm run dev        # web → 127.0.0.1:3100
npm run dev:agent  # background scheduler stub
npm test
npm run typecheck
```

**Important:** The web app binds `127.0.0.1:3100` only. Remote access is via Tailscale Serve, not by widening the bind address.

## Monorepo structure

```
apps/web      Next.js 16 + React 19 + Tailwind 4
apps/agent    Scheduler (no HTTP listener)
packages/contracts   Zod schemas + API contract
packages/db          Drizzle SQLite schema
packages/vault       Credential Manager (Phase 1)
packages/egress      Outbound allowlist (Phase 1)
packages/crypto      Encryption helpers (Phase 1)
```

## Memory system

Project knowledge in `memory/`. Start at [memory/INDEX.md](./memory/INDEX.md). CI runs drift detection via `npm run memory:check`.

## Phase 0 exit criteria

- [x] Relocated off OneDrive
- [x] Monorepo scaffold
- [x] Contracts frozen (`contracts-v0.1.0`)
- [x] Memory system + drift check
- [x] CI skeleton

Phase 1 adds: encrypted DB, auth, egress, design system, app shell.
