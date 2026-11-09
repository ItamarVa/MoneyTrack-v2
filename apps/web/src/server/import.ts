/**
 * Home Assistant one-time import of the Windows export, uploaded from the
 * browser or left on the Samba share, started from Settings → Backup by an
 * unlocked user. Replaces all household data with the
 * Windows export but keeps the HA-enrolled users (carryOverHaUsers). The agent
 * notices the swapped file and reopens it (apps/agent/src/index.ts).
 */
import fs from "node:fs";
import path from "node:path";
import {
  HA_IMPORT_FILENAME,
  carryOverHaUsers,
  importDatabaseFromHaTransfer,
  isHaImportFileAvailable,
  replaceLiveDatabaseFile,
  resolveDataDir,
  resolveDbPath,
  resolveImportDir,
  resolveImportFilePath,
} from "@moneytrack/db";
import { reopenServerDbWithKey, resetServerDb } from "@/server/db";
import { isHaAddonMode } from "@/server/runtime-mode";

export { isHaImportFileAvailable };

const DEFAULT_SHM_KEY_PATH = "/dev/shm/moneytrack-db.key";

function readDbKeyHandoff(): Buffer | null {
  const keyPath = process.env.MONEYTRACK_DB_KEY_FILE ?? DEFAULT_SHM_KEY_PATH;
  try {
    const raw = fs.readFileSync(keyPath);
    if (raw.length === 32) {
      return raw;
    }
    const decoded = Buffer.from(raw.toString("utf8").trim(), "base64");
    return decoded.length === 32 ? decoded : null;
  } catch {
    return null;
  }
}

export type RunHaImportResult = {
  importedAt: string;
  importPath: string;
};

/** Matches nginx `client_max_body_size` in the add-on; a larger upload never reaches Next. */
export const HA_IMPORT_MAX_UPLOAD_BYTES = 32 * 1024 * 1024;

/** Stores a browser-uploaded bundle under /data; the caller deletes it after the import. */
export function saveUploadedImportBundle(bytes: Uint8Array): string {
  const uploadPath = path.join(resolveDataDir(), `${HA_IMPORT_FILENAME}.upload`);
  fs.writeFileSync(uploadPath, bytes, { mode: 0o600 });
  return uploadPath;
}

/**
 * Import a Windows bundle (an upload, or `moneytrack-import.db` on the share)
 * into `/data`, re-keyed with the unlocked DB key in /dev/shm.
 */
export async function runHaDataImport(
  exportPassphrase: string,
  importPath: string = resolveImportFilePath(),
): Promise<RunHaImportResult> {
  if (!isHaAddonMode()) {
    throw new Error("import_not_available");
  }

  if (!fs.existsSync(importPath)) {
    throw new Error("import_file_missing");
  }

  const targetKey = readDbKeyHandoff();
  if (!targetKey) {
    throw new Error("db_locked");
  }

  const dataDir = resolveDataDir();
  const stagingPath = path.join(dataDir, `${HA_IMPORT_FILENAME}.staging`);

  resetServerDb();

  try {
    importDatabaseFromHaTransfer({
      importPath,
      exportPassphrase,
      outputDbPath: stagingPath,
      targetKey,
    });
    carryOverHaUsers({ fromDbPath: resolveDbPath(dataDir), toDbPath: stagingPath, key: targetKey });
    replaceLiveDatabaseFile(dataDir, stagingPath);
  } catch (error) {
    if (fs.existsSync(stagingPath)) {
      fs.rmSync(stagingPath, { force: true });
    }
    resetServerDb();
    throw error;
  }

  await reopenServerDbWithKey(targetKey);

  try {
    fs.unlinkSync(importPath);
  } catch {
    // Import succeeded; leaving the bundle is safer than rolling back.
  }

  return {
    importedAt: new Date().toISOString(),
    importPath,
  };
}

/** For `/api/ha/status` — whether a transfer bundle waits on the share. */
export function haImportAvailableForStatus(): boolean {
  if (!isHaAddonMode()) {
    return false;
  }
  return isHaImportFileAvailable(resolveImportDir());
}
