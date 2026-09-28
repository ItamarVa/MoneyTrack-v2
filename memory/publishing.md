---
topic: publishing
tags: [v2, git, remotes, release]
last_updated: 2026-09-28
status: active
owns:
  - scripts/privacy/**
---

# Publishing (MEM-PUB)

Two GitHub repositories hold this project and they deliberately share no commit
ancestor. This file is the only place that describes how to move code between
them. Read it before touching any remote.

## The rule

**All day-to-day work happens on the private repository only.** Commit, push and
pull against `origin`/`master` exactly as before publication; nothing about the
normal workflow changed.

**Never push to `public` without an explicit, current instruction from the owner
and a completed pre-flight check.** Not as a convenience, not "while we are here",
not because a push failed and a second remote looks like the fix. A mistaken push
there is irreversible: GitHub forks, caches and search engines keep copies of
anything that lands in a public repository, even for a minute.

## The two remotes

| Remote | Repository | Branch | Visibility | Contents |
|--------|-----------|--------|------------|----------|
| `origin` | `ItamarVa/MoneyTrack` | `master` | private | full history, 27 commits, the owner's work email on most of them |
| `public` | `ItamarVa/MoneyTrack-v2` | `main` | **public** | one orphan commit (`c96e3cb`), 545 files, 2026-09-28, add-on 0.1.7 PIN cookie fix; `.cursor/` is left out of the snapshot (`git rm -r --cached .cursor` after `git add -A`); authored as `69388551+ItamarVa@users.noreply.github.com` |

Published 2026-09-15 (ADR-006). The public commit is an orphan: it has no parent
and no ancestor in common with `master`. That is what keeps the work email and
the pre-scrub file versions out of it.

Deleted and recreated under the same name on 2026-09-27 to purge the snapshots
that carried fixture leaks (the old SHAs now return 422); the old GHCR package
`moneytrack-amd64` was deleted too. After recreation the add-on workflow
republished it and it was anonymously pullable without a settings change;
confirm with an anonymous `ghcr.io/token` + `tags/list` check after any
recreation and, if denied, make it public at
`https://github.com/users/ItamarVa/packages/container/moneytrack-amd64/settings`.

The `Add-on image` workflow has a `paths` filter and does not run on a
force-pushed orphan refresh (CI does). When a refresh changes what the image
contains, start it by hand with `workflow_dispatch` on `main`, as done for
`fb340ee` (add-on 0.1.1), `501a74c` (add-on 0.1.2), `d92d63d` (add-on 0.1.3) and `526ec13` (add-on 0.1.4), `6e472d9` (add-on 0.1.5), `4076bcc` (add-on 0.1.6) and `c96e3cb` (add-on 0.1.7). Without `gh`, dispatch through the REST API with the token from `git credential fill`.

Consequences of the split, all of them load-bearing:

- `git push public master` would publish the entire private history. Never run it.
- `git merge main` on `master` (or the reverse) would join the two graphs and
  carry history across. Never run it.
- `git pull public` on a work branch does the same damage. Never run it.
- The local `main` branch is the orphan snapshot and tracks `public/main`. It
  exists only as the handle for a future refresh. **Committing normal work while
  `main` is checked out sends it to the public repository.** Check
  `git rev-parse --abbrev-ref HEAD` if unsure; day-to-day work belongs on `master`.

## Refreshing the public repository

Only on an explicit request. The public repo stays a single squashed commit, so a
refresh replaces it rather than adding to it.

1. Be on `master` with a clean tree and everything pushed to `origin`.
2. Gates must be green: `npx tsc -b`, `npm test`, `npm run lint`,
   `node scripts/memory/check-drift.mjs`.
3. **Mandatory: `npm run privacy:check` must exit 0.** It compares every file
   `git add -A` would stage against the owner's real data in the local encrypted
   DB and vault (see "Real-data leak guard" below). Exit 1 lists masked hits:
   replace them with synthetic data. Exit 2 means the real data could not be
   read — the gate has not passed; fix the cause, never skip it.
4. Re-run the personal-data scan over the whole tree, because new code and new
   memory entries both reintroduce it. Search case-insensitively for the
   household first names and the employer name — in Latin *and* Hebrew spelling,
   the report files have leaked them before — plus `Users\\<name>` paths, real
   account and branch numbers, live statement amounts, and any fixed password.
   `memory/security-audit-2026-08.md` lists what was removed the first time.
5. Confirm `git ls-files` shows no `.env`, database, key or backup file.
6. Delete the agent files for finished work under `memory/agents/`, as the memory
   rules already require. Whatever is left there ships.
7. Build a fresh orphan snapshot, never a merge:

   ```
   git checkout --orphan public-snapshot
   git add -A
   git -c user.name=ItamarVa \
       -c user.email=69388551+ItamarVa@users.noreply.github.com \
       commit -m "<subject>"
   ```

8. Verify before the push: `git rev-list --count HEAD` is 1, and
   `git log --format='%ae %ce' -1` shows only the noreply address.
9. `git push --force public public-snapshot:main`
10. Return to `master` and delete the temporary branch.
11. Confirm against the API that the public repo holds one commit with no work
    email:
    `https://api.github.com/repos/ItamarVa/MoneyTrack-v2/commits`

Steps 3 and 8 are the ones that matter. `tsc` and the tests cannot tell you
whether real data or an identity leaked; only those checks can.

## Real-data leak guard

Why: on 2026-09-27 real bank-statement strings (a foreign merchant descriptor, a
payee's full name, a cloud-billing descriptor) turned up in published test
fixtures — agents had pasted them in while debugging. The step-4 grep only knows
a fixed list of names and numbers, so it missed them. The public repository was
deleted and is recreated from a clean `master` snapshot only after this guard.

What `scripts/privacy/check-real-data.mjs` does:

- Reads the DB key from the Windows Credential Manager entry the app uses
  (`loadSecret(MASTER_KEY_TARGET)` from `@moneytrack/vault` — the read path, not
  `getOrCreateMasterKey`, so a missing key is never created) and opens the
  SQLCipher DB **read-only**; the running agent is not disturbed.
- Loads transaction descriptions (raw and normalized) plus their word pairs,
  scraper memos, merchant names and aliases, rule and salary patterns, salary
  source, person, user, account and card names, notes, provider account numbers,
  and non-password bank login fields from the vault. Values under 5 characters
  and numbers under 6 digits are skipped.
- Text matches as a substring of the normalized line (word pairs on word
  boundaries); numbers match whole digit runs, separators and leading zeros ignored.
- Prints masked values only (`li***ly`), with `file:line` and the value kind.
  Real values stay in memory; nothing is written.
- Fails closed: no key, no DB, no SQLCipher build, a failed query or zero values
  loaded all exit 2.

`scripts/privacy/real-data-allowlist.txt` holds SHA-256 hashes of normalized
values that may legitimately appear (seeded rules, the seeded admin, generic
labels in production code). Never plaintext. A hash of a short common word is
reversible by guessing, so allowlist only values already public in the repo.

## Commit identity

Commits from this clone are authored as
`69388551+ItamarVa@users.noreply.github.com`, set in `.git/config` as a
repo-local `user.email` on 2026-09-15. It applies to the private repo too, not
only to public snapshots: the owner does not want the work address on new
commits anywhere.

Why repo-local and not global: `~/.gitconfig` deliberately keeps the work address
because the same machine pushes to the employer's GitLab. Overwriting it there
would misattribute work commits.

`.git/config` is not versioned, so the repo-local setting alone would be lost on
a re-clone. Two `includeIf` rules in `~/.gitconfig` now pull the address from
`~/.gitconfig-personal` and survive that:

- `hasconfig:remote.*.url:https://github.com/ItamarVa/**` — any clone of a
  personal GitHub repo, wherever it sits on disk.
- `gitdir/i:C:/Users/<user>/OneDrive - <org>/**/AI Projects/` — any project
  under the personal projects folder, including a brand-new `git init` that has
  no remote yet. The `**` avoids spelling the non-ASCII folder name in config.

Verified 2026-09-16 across four cases: personal folder without a remote, personal
folder with a GitHub remote, and a personal GitHub remote outside that folder all
resolve to the noreply address; a work GitLab remote outside the folder keeps the
work address. `user.name` stays at the global value; it carries no address.

After any re-clone, confirm with `git var GIT_AUTHOR_IDENT` before the first
commit rather than trusting the rules blindly.

## Local git credential setup

Authentication to both remotes runs through Git Credential Manager 2.7.3
(`C:\Program Files\Git\mingw64\bin\git-credential-manager.exe`), configured as
`credential.helper = manager` in the system config. GCM has no credential store
of its own here: `credential.credentialStore` is unset, so it uses its Windows
default and the token lives in Windows Credential Manager under
`git:https://github.com`.

`~/.gitconfig` carried a second, stale `credential.helper = manager-core`, the
name GCM used before 2.1. Git runs every configured helper in turn, so the
working `manager` authenticated the push and the dead `manager-core` printed
`git: 'credential-manager-core' is not a git command` every time. Removed
2026-09-15 with `git config --global --unset credential.helper`. Not a security
problem — same product, retired alias — but the noise masks genuine auth
failures, which is why it is gone.

## Stale local branches

`v2/public-prep` is the pre-publication safety branch, fully merged into
`master`. It carries nothing `master` lacks and can be deleted whenever.
