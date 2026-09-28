/**
 * Runtime DB key handoff via tmpfs (HA add-on). Web writes after unlock; agent polls before initDb.
 */

import fs from "node:fs";

export const DEFAULT_SHM_DB_KEY_PATH = "/dev/shm/moneytrack-db.key";

export function resolveShmDbKeyPath(): string {
  return process.env.MONEYTRACK_SHM_DB_KEY_PATH ?? DEFAULT_SHM_DB_KEY_PATH;
}

export function readDbKeyFromShm(path = resolveShmDbKeyPath()): Buffer | null {
  try {
    const key = fs.readFileSync(path);
    if (key.length !== 32) {
      return null;
    }
    return key;
  } catch {
    return null;
  }
}

export function writeDbKeyToShm(dbKey: Buffer, path = resolveShmDbKeyPath()): void {
  if (dbKey.length !== 32) {
    throw new Error("DB key must be 32 bytes");
  }
  const dir = path.slice(0, path.lastIndexOf("/"));
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path, dbKey, { mode: 0o600 });
  try {
    fs.chmodSync(path, 0o600);
  } catch {
    // best-effort on platforms without Unix modes
  }
}

export function clearDbKeyFromShm(path = resolveShmDbKeyPath()): void {
  try {
    fs.unlinkSync(path);
  } catch {
    // already absent
  }
}

export type WaitForDbKeyOptions = {
  path?: string;
  pollMs?: number;
  timeoutMs?: number;
  onWait?: () => void;
};

export async function waitForDbKeyInShm(
  options: WaitForDbKeyOptions = {},
): Promise<Buffer> {
  const path = options.path ?? resolveShmDbKeyPath();
  const pollMs = options.pollMs ?? 1000;
  const timeoutMs = options.timeoutMs ?? 0;
  const started = Date.now();
  let notified = false;

  while (true) {
    const key = readDbKeyFromShm(path);
    if (key) {
      return key;
    }
    if (!notified) {
      options.onWait?.();
      notified = true;
    }
    if (timeoutMs > 0 && Date.now() - started >= timeoutMs) {
      throw new Error("Timed out waiting for database unlock key");
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
