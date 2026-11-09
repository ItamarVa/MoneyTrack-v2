# MoneyTrack v2

Start here: [memory/INDEX.md](./memory/INDEX.md)

## Project memory

All architectural knowledge lives in `memory/`. The index file links to topic satellites with stable IDs. CI enforces memory drift detection.

## Phase 0 scope

This branch (`v2/develop`) contains the contract freeze and monorepo scaffold only. No auth, encryption runtime, or scraper yet.

## Local development

- **Repo:** `C:\MoneyTrack\repo`
- **Runtime data:** `C:\MoneyTrack\data` (never in repo)
- **Web:** binds `127.0.0.1:3100` only
- **Agent:** scheduler stub, no HTTP listener

```bash
npm install
npm run dev        # web on 127.0.0.1:3100
npm run dev:agent  # background agent stub
npm test
npm run typecheck
```

## Setup launcher

Double-click `C:\MoneyTrack\Setup-MoneyTrack.bat` for first-time setup (Node 24 check, directory creation, repo clone/update).
