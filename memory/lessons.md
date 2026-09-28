---
topic: lessons
tags: [v2, retrospective]
last_updated: 2026-09-28
status: active
owns:
  - memory/**
---

# Lessons Learned (MEM-LESSONS)

## v1 audit (2026-08)

- v1 is real but does not meet v2 requirements � full data model rewrite needed.
- `buildSourceId` trusting scraper `identifier` is broken � optional, type-inconsistent, shared across installments.
- HTTP worker on 8080 adds attack surface � v2 uses DB job queue instead.
- Real emails in seed/platform-users must never be committed again.
- OneDrive + nested Games.git worktree is disqualifying for financial data.

## Phase 0

- Relocated to `C:\MoneyTrack\repo`; runtime data at `C:\MoneyTrack\data`.
- Contract-first: parallel workstreams code against frozen types, not each other's implementations.

## Phase 2 follow-up (2026-09)

- The scrape pipeline shipped without any way to enter credentials, so no sync could ever succeed: `sync-runner` threw "Vault secret not found" on every run. A feature is not done until a user can reach it from the UI ? count the reachable path, not the modules.
- Provider login fields belong in `packages/contracts`, not `packages/providers`: importing the scraper library into the web app would drag puppeteer into the Next.js bundle. A test in `packages/providers` guards the duplication.

## Wave 3 integration (2026-09-13)

- Agent tick call-order tests must use `vi.mocked(fn).mock.invocationCallOrder` — bare `fn.mock` fails `tsc -b` because the imported function type is not `Mock`.

## Amount sign and period semantics (2026-09-13)

- `transactions.amountIls` is an unsigned magnitude; the sign lives in `direction` and `kind`. Any UI that branches on `amountIls < 0` is wrong by construction — it silently classified every row as income on the transactions page and painted every row with the income colour. Use `expenseContribution`/`incomeContribution`, never the raw sign.
- Page-level totals computed from the loaded page only (50 rows) drift as the user scrolls. Totals belong to the server, over the whole filter, not to the client slice.
- `queryCategoryBreakdownFromRollups` compared periods as `YYYY-MM`, so any range narrower than a whole month silently widened to the full month. Expense breakdown no longer uses that rollup fast path — it netted income into category buckets and disagreed with every other dimension; all expense dimensions now scan transactions via `expenseContribution`.
- Owner semantics for "this month": charge date, whole calendar month, never capped at today, and expense-only surfaces carry no minus sign.
- Refreshing a list after a save by flipping a `loading` flag unmounts the list and the form beside it: React drops the component state inside (the TanStack sort order) and the browser clamps the scroll back to the top. Show the placeholder on the first load only, and patch the single changed row when the row set itself has not changed.
- `processRefunds` used to convert every unmatched credit to `refund`, which is right for a card but silently swallowed bank income. The account kind is the discriminator: cards receive money back, bank accounts receive salaries.
- `upsertTransaction` updated `kind` on re-sync but not `direction`, producing `income`+`debit` pairs that made header income negative — always write `direction` beside `kind` on every update path.
- Import `asc`/`desc`/`sql` from `@moneytrack/db`, not a second `drizzle-orm` import in the web app: mixed instances fail `tsc -b` on `orderBy`.
- Deleting an API route leaves stale references in `apps/web/.next/types` until the dev server rebuilds or that folder is removed.
- Rule changes enqueue a `categorize_bulk` job (newest month first); the header chip polls status and fires `moneytrack:classified` when done — no manual reclassify button.
- Client components must not import `@moneytrack/classify` or `@moneytrack/db` — Turbopack pulls `node:fs`/`node:child_process` into the browser bundle and the transactions page crashes at runtime. Keep seeded IDs like `UNCATEGORIZED_CATEGORY_ID` in `apps/web/src/lib/category-ids.ts`.
- `classify-jobs.ts` must import `./rules-helpers` via `@/server/rules-helpers`, not a relative `.js` path — Turbopack fails module resolution on login when the compiled artifact is missing.
- `EADDRINUSE` on port 3100 means the dev server is already running; do not treat a second `npm run dev` as a failure. Verify with `GET /login` → 200.
- `scripts/smoke-pages.mts` bootstraps a DB session when login returns 401 (password changed from default); use it after crash fixes to verify all app pages and key APIs.
- `filter.categoryIds` must expand to all descendant category IDs before `inArray` — exact-match on a parent ID alone excludes transactions on the parent row and on child categories; the old sub-category drill-down looked empty for that reason.
- `buildCategoryInsights` must bucket by `chargeDate`, not `transactionDate`, or the header total and insight cards disagree on the same category page.
- `recomputeRollups` must not `SELECT` the full transactions table on every category edit — scope queries to dirty periods and preload `cards` once.
- Popovers inside a virtualized table with `overflow-auto` need a portal or they render behind/clipped rows; classification explanation strings belong in a web-layer label map, not English engine prose.
- Loading tag IDs via 50 detail fetches per list page was the main client-side sluggishness after rollup fix — return `tagIds` on the list API row instead.

## Entity drill-down and chart fixes (2026-09-14)

- Breakdown API `drillDown.filter` predicates are useless until a client consumes them — producing `merchantIds: [key]` on the server while the donut handler only calls `setLevel(3)` with the unchanged page filter shows the whole month, not the slice. Wire navigation to `entityDetailUrl` or apply the predicate to the fetch.
- Recharts chart wrappers need `dir="ltr"` for layout, but tooltip and legend roots inside them inherit LTR and render Hebrew left-to-right — set `dir="rtl"` on those inner roots and keep `<bdi dir="ltr">` around amounts.

## Ring drill chain (2026-09-14)

- Shared chart components must not hardcode navigation when an embedding page needs in-place drill — `DrillDownDonut` defaults to `router.push` on slice click; entity pages pass `navigateOnSlice={false}` and handle `{ type: "slice" }` locally.
- Per-transaction rings belong in the view layer, not the breakdown enum — `RingDimension` extends `BreakdownDimension` with `"transaction"`; slices are built from `fetchTransactions` via `entity-transaction-slices.ts`, not `queryBreakdown`.

## Money rules exposed by the first bank connection (2026-09-14)

- Hebrew matching rules written without real statements match nothing. `looksLikeCardSettlement` looked for `חיוב כרטיס` / `max card` / `isracard`; the real Discount wording is `מקס איט פי חיוב`, `ישראכרט חיוב`, `כ.א.ל חיוב`. A rule that never fires is invisible — the only symptom was the dashboard quietly counting MAX spend twice. Cross-check the bank payment against the card's own monthly total to prove duplication.
- Matching two transactions on amount alone is not evidence. 19 of 25 auto internal-transfer links were false (a nursery purchase paired with a Bit withdrawal), and because the link excludes both sides, the bug *deleted* real expenses and real income. Require the description to agree too.
- A money-market fund or provident deposit is not consumption. Leaving them as `expense`/`income` inflated one month several times over and turned a single fund sale into "income". `kind = transfer` contributes 0 to both sides.
- Tag a rule's scope by account kind. Savings and settlement patterns run on bank rows only, or a purchase at a shop called `מיטב` becomes a pension deposit; never match a bare `כאל`, which sits inside `מיכאל`.
- Only bank rows carry `raw_accounts.balance`, and no API read that table — a synced account had a balance in the DB and nothing on screen. Promote it to `accounts.balance_ils` during sync.
- When a list endpoint builds its own `where` instead of `selectAnalysisTransactions`, every new global filter has to be added twice; `GET /api/transactions` needed the account-scope condition separately.

## Income drill-down and ring polish (2026-09-15)

- Breakdown `drillDown.filter` for the salary dimension must carry `salaryScope`, not just `sourceSegment.salarySourceId` — nothing in `AnalysisFilter` consumed the segment alone, so הכנסות אחרות was a dead end.
- Inner-ring navigation must pass `kinds: ["income"]` to `drillDownToTransactionsUrl` — merchant/account drill predicates otherwise pull that entity's expenses too.
- `kindsFromSearchParams` in `TransactionsPageClient` must be `useMemo`'d on `searchParams.toString()` — a fresh array every render recreates `loadPage`, re-triggers the fetch `useEffect`, and storms `/api/transactions` when `kinds=income` is in the URL.
- Recharts tooltip wrapper and the centre-label overlay are both `position: absolute` with `z-index: auto` — the later DOM sibling wins; set `wrapperStyle={{ zIndex: 30 }}` on `<Tooltip>` or the tooltip renders behind the centre text.
- Grid-stretching a donut beside a tall legend (`ResponsiveContainer height="100%"` + `min-h-96`) inflates the chart to the legend height; pin the chart with `aspect-square max-w-* self-start` instead.

## Public-release prep (2026-09-15)

- A column named `error_message_redacted` redacts nothing. The `SCRAPE_EXCEPTION` path stored `error.message` verbatim and `ingestAccount` wrote the full account number into it. When an audit finding says "the test is a stub", check whether the thing under test exists at all.
- A gate that compares two hand-written constants can never fail. `run-budget-check.mjs` compared `placeholderMs` against `budgetsMs` and reported OK for months; the first real measurement came in 40x over target.
- Set a CI timing ceiling from the *slowest* local run, not the first. Repeated runs on the same machine varied 2x, so a ceiling at 2.5x of one sample was already nearly breached on the next run.
- Deleting a dead env var beats renaming it. Two per-person temp-password vars leaked household names in the variable names themselves and nothing read them — `git grep process.env` before assuming a variable matters.
- `npm run build --workspaces` runs alphabetically, so `ingest` compiles against a stale `providers/dist`. Use `tsc -b`, which follows the project references.
- Bundling a breach denylist, filter it by the schema's minimum length first: 7913 of the top 10k entries were shorter than `MIN_PASSWORD_LENGTH` and could never be reached.
- Don't raise `MIN_PASSWORD_LENGTH` to satisfy an ASVS row — `LoginRequestSchema` validates it on *login*, so a stricter minimum locks out the existing password before it can be changed.
- Grep for the default password's *value*, not for `password`. Three fixed credentials shipped in three shapes: a constant in the admin scripts, a `.env` default written by `ensure-env-secrets.ps1` under a variable nothing read, and a `Write-Host` line in the launcher.
- Scrubbing the code is only half of it — the memory files quoted the very names being removed. Re-run the personal-data grep over `memory/` after writing the report that describes the scrub.
- Git runs *every* configured `credential.helper` in turn, across system and global config. A working `manager` plus a stale `manager-core` in `~/.gitconfig` authenticates fine and still prints `not a git command` on each push. Read `git config --show-origin --get-all` before assuming a git warning means a broken tool.
- On a machine shared between work and personal git accounts, `includeIf` beats editing the global `[user]` block: it splits the identity without touching the employer's repos. A `gitdir` pattern can reach a non-ASCII folder through `**` instead of spelling it, which keeps the config file ASCII.
- Documenting local git config leaks too: `publishing.md` quoted the `includeIf` folder path verbatim, carrying the Windows username and employer. Caught by the pre-refresh grep on 2026-09-26; write such paths with `<user>`/`<org>` placeholders.

## Auth lockout and salary reporting (2026-09-20)

- Login lockout must return distinct API codes (`account_locked`, `ip_throttled`) with `retryAfterSeconds` — a generic `auth_failed` made correct passwords look wrong. Ship `Reset-Password.bat` for self-service recovery without the terminal.
- Salary income display month uses `reporting_period` with the 25–5 charge-date rule (day ≥ 25 → next month; day ≤ 5 → same month); expenses stay on calendar `charge_date`. Locked overrides survive resync and reapply.

## HA add-on image (2026-09-27)

- Root `npm run build` still used the alphabetical workspace order the lesson above warns about (agent compiled before any package had `dist/`, TS2307 exit 2 in Docker). Local runs passed only because stale `dist/` and `.next/` masked it: verify container builds from a clean clone that honours `.dockerignore`.
- A placeholder rewritten at container start rewrites every literal copy, including the constant code compares against, and Next also stores `basePath` regex-escaped in the middleware matcher. Replace a unique token and never compare against the placeholder at runtime.
- HA base images ship `/usr/bin/bashio`, not `bashio.bash`. Without Docker, pull the base image layers from GHCR with an anonymous token and list them instead of guessing paths.
- Turbopack standalone output omits directories read through `import.meta.url` + `path.join` (the drizzle migrations). List the `e.P("...")` paths in the server chunks and check each exists in the standalone tree.
- Supervisor validates `watchdog` against a URL regex; `watchdog: ""` drops the whole add-on from the store.

## HA add-on ingress 404 and store icon (2026-09-27)

- Ingress strips its prefix: HA Core proxies `/api/hassio_ingress/{token}/{path}` to Supervisor `/ingress/{token}/{path}`, and Supervisor calls `http://{addon_ip}:{ingress_port}/{path}` (`supervisor/api/ingress.py` `_create_url`). A Next build with `basePath` = the ingress prefix therefore 404s on every request unless nginx adds the prefix back; `apply-base-path` writes it as an nginx include from the validated token, so the `X-Ingress-Path` header is never trusted for routing.
- Next 308-redirects `<basePath>/` to `<basePath>`, and HA Core's ingress route needs the slash after the token, so the panel's first request dead-ends in a Core 404; nginx maps `location = /` to the bare prefix.
- The store shows an icon only when `icon.png` / `logo.png` sit next to `config.yaml` (`supervisor/apps/model.py` `path_icon`); nothing in `config.yaml` references them.
- `ha-addon/** text eol=lf` rewrote the PNG bytes on commit; images under a text rule need `binary`. Compare `git hash-object --no-filters <file>` with `git rev-parse HEAD:<file>` after committing any binary.
- Simulate ingress with `http.request`, not `fetch`: fetch will not set `Host`, and the CSRF check compares `Origin` with `Host`, so every POST fails for a reason the device never sees.
- nginx.org's Windows 1.22.1 build is the version Debian bookworm ships; `nginx -t` and a real proxy run validate `nginx.conf` locally without Docker.

## HA add-on first-run enrollment (2026-09-27, add-on 0.1.2)

- Every HA entry point (`/api/ha/status`, `/api/ha/enroll`, the `(app)` layout, the API guard) called `getServerDb()` before a key existed, so a fresh install could only 500. Pre-unlock gates must decide from `keyslots.json` + the shm key alone; the DB opens only after the key is in shm.
- `getServerDb()` cached its rejected promise, so one early "locked" failure poisoned the process until restart; drop the cache on rejection.
- Unlock looked the user up in the DB to find their keyslot — impossible while locked. Passphrase slots carry `haUserId` so unlock finds the slot first.
- The DB-backed passphrase throttle could not record a failed unlock (no DB yet); the throttle is in memory.
- First-vault creation must be exclusive: write a tmp file and `fs.linkSync` it (EEXIST on a race) — a double-tap otherwise creates two vault keys and loses one.
- The desktop cookie fast-redirect in `middleware.ts` sent HA users to `/login`; in HA mode the `(app)` layout picks the gate, and code never redirects to `/` (Next strips the ingress slash, Core 404s).
- A 12-character test string passed a "too short" check meant for < 12; count the characters in boundary fixtures.
- Local end-to-end without Docker: temp clone, HA-mode standalone build, `apply-base-path` against a fake Supervisor, nginx 1.22.1, an ingress stand-in that sets `X-Remote-User-*`, plus Puppeteer on the installed Chrome for the UI.

## Dependency audit (2026-09-27)

- Vitest 4 pulls Vite 8, whose oxc transform honours the web tsconfig `jsx: "preserve"` and fails on `.tsx` imports; `vitest.config.ts` sets `oxc.jsx.runtime = "automatic"`.
- A pinned direct dependency can still drag in fresh transitive releases (Vite, rolldown); check lockfile diffs for publish dates and pin via root `overrides`.
- `extract-zip` (via `israeli-bank-scrapers` → puppeteer 24) and `esbuild` (via `drizzle-kit`) have no fixed release; `npm audit --audit-level=high` keeps failing until the scraper moves to puppeteer 25.
- Test fixtures copied from real statements leak travel and payee names into the public repo; write synthetic descriptors.
- An accepted audit risk belongs in a dated file the CI gate reads (`security/audit-accepted.json`), not in a lowered `--audit-level`: the gate still fails on any new high advisory and on an expired acceptance.
- `tsc -b` emits `*.test.js` into `dist/` and the add-on image copies all of `packages/`, so tests would ship in the GHCR image; root `.dockerignore` drops test files and `packages/*/src/fixtures` (not `apps/web/.../charts/fixtures`, which runtime code imports).

## Public CI green (2026-09-27)

- gitleaks 8.24 global `[allowlist]` `regexes` match the extracted secret group by default (`regexTarget` unset), unanchored; anchor with `^...$` so a false-positive entry cannot hide a real key.
- semgrep `gcm-no-tag-length` only matches a three-argument `createDecipheriv`; passing `{ authTagLength: 16 }` satisfies it without touching the stored `iv || tag || ciphertext` format.
- Piping `git archive` through PowerShell corrupts the tar; write it with `git archive -o`.

## HA passphrase policy (2026-09-28)

- A temp copy with `node_modules` junctioned is enough for `tsc -b --force`, vitest and eslint, but `next build` (Turbopack) refuses packages outside the project root: build the add-on mode in the temp copy after `npm ci --ignore-scripts` (node-gyp has no Visual Studio for Node 25; `better-sqlite3-multiple-ciphers` ships `prebuilds/win32-x64.node`, so skipping its install script is safe). Delete junctions with `[IO.Directory]::Delete(path, $false)`, never a recursive delete, or the real `node_modules` goes with them.
- A password rule with character classes makes most of the common-password denylist unreachable: none of its ~2,000 entries has all four classes. Compare normalized candidates instead (0.1.4), and every peeling stage, not only the bare core: the list holds `qwerty123` but not `qwerty` because it was filtered to 8+ characters.

## HA PIN loop after import (2026-09-28, add-on 0.1.8)

- Next 16's Turbopack production build scope-hoists modules into chunk groups: in the add-on build `connection.ts` sat in three route-handler copies (PIN, status+import, pages) and pages use a separate runtime (`chunks/ssr/[turbopack]_runtime.js`). Each copy had its own `let sqlite`/`dbPromise`, so one process held several DB connections. Check with: `rg -l "Database not initialized" .next/server/chunks` and the `R.c(...)` lists in each `route.js`/`page.js`.
- `resetServerDb()` before the import closed only the import route's copy. On Linux `rename()` swaps the file under the other copies, which keep reading the old inode: the PIN route (first opened after the import) wrote its session to the new DB while the `(app)` layout checked the old one, so every correct PIN bounced back. On Windows the same bug shows as `EBUSY` on the import's unlink. A restart of the add-on clears it until the next import.
- Process-wide handles live on `globalThis` under `Symbol.for(...)` keys; `connection.test.ts` loads two copies with `vi.resetModules()` to prove they share one.
- Harness: `git archive -o` to a temp dir, `npm ci --ignore-scripts`, HA-mode `npm run build`, copy standalone + static + drizzle, replace the ingress placeholder token, run `server.js` with a temp `MONEYTRACK_DATA_DIR` and `MONEYTRACK_SHM_DB_KEY_PATH`/`MONEYTRACK_DB_KEY_FILE`, then drive enroll → import → PIN → `/dashboard` with `http.request` and `X-Remote-User-*` headers. A synthetic export comes from `openEncryptedDatabase` + `runMigrations` + `exportDatabaseForHaTransfer`.

## Lean add-on storage (2026-09-28)

- Net worth summed `raw_accounts` balances keyed by provider account number; daily prune kept only three runs regardless of status, so three failed syncs could delete every successful raw copy and drop bank assets from net worth even though `accounts.balance_ils` was already updated on sync — always derive household totals from normalized tables, not raw landing copies.
- `israeli-bank-scrapers` filters transactions by purchase date when `enableTransactionsFilterByDate` defaults true; incremental sync windows would hide installment charges whose original purchase predates `startDate` — disable that filter and rely on `identity_hash` upserts for duplicates.
