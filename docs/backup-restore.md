# Backup and restore — MoneyTrack v2

Runtime data lives at `C:\MoneyTrack\data`. Backups must be encrypted and stored outside the repo and outside cloud-sync folders.

## Prerequisites

- MoneyTrack service stopped (web + agent).
- BitLocker enabled on the data volume.
- Backup destination on a separate drive or encrypted external media (e.g. `D:\MoneyTrack\backups`).

## Create a backup (manual)

1. Stop the app (use the Stop launcher or stop both processes).
2. Copy these files atomically (same timestamp):
   - `C:\MoneyTrack\data\moneytrack.db`
   - `C:\MoneyTrack\data\moneytrack.db-wal` (if present)
   - `C:\MoneyTrack\data\moneytrack.db-shm` (if present)
3. Export the master key reference name only (`moneytrack/master-db-key`) — the key itself stays in Windows Credential Manager under the service account. Document which Windows user owns the Credential Manager entry.
4. Name the folder `backup-YYYY-MM-DD-HHMM` and verify file sizes match the source.

> ponytail: automated encrypted backup with a separate backup key is planned; this procedure covers manual restore drills until that ships.

## Restore procedure

**Warning:** restore overwrites live data. Stop all MoneyTrack processes first.

1. Stop web and agent processes.
2. Rename the current data folder to `C:\MoneyTrack\data.bak-<timestamp>`.
3. Create `C:\MoneyTrack\data`.
4. Copy backup files into `C:\MoneyTrack\data`:
   - `moneytrack.db`
   - `moneytrack.db-wal` / `moneytrack.db-shm` if they existed in the backup.
5. Ensure the Windows user running MoneyTrack is the same user whose Credential Manager holds `moneytrack/master-db-key`. If the Windows profile was lost, recovery requires out-of-band key escrow documented in `memory/security.md`.
6. Start MoneyTrack and log in with a known user password.
7. Verify:
   - Dashboard loads with expected transaction counts.
   - A spot-check transaction from before the backup date is visible.
   - `npm run memory:check` passes in the repo (no code change required).

## Restore drill schedule

- **CI:** `npm run test:restore` (`scripts/backup-restore-drill.mjs`) walks this
  procedure against a throwaway encrypted database on every push and fails if the
  restored copy does not match the original. It covers the stop-then-copy path as
  written above; a crash-consistent copy of a *running* database is still manual.
- **Production:** quarterly calendar reminder — record outcome in `memory/lessons.md`. An untested backup is not a backup.

## Failure modes

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| `SQLITE_NOTADB` on start | Wrong key or corrupt file | Restore from earlier backup; verify Credential Manager user |
| Empty dashboard after restore | WAL not copied | Restore `-wal`/`-shm` sidecars from same backup set |
| Login works but no transactions | Restored wrong `.db` file | Re-copy from verified backup folder |
