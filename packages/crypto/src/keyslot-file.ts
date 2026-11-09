/**
 * Atomic read/write for /data/keyslots.json (HA add-on custody).
 */

import fs from "node:fs";
import path from "node:path";
import { KEYSLOTS_FILENAME, assertKeyslotFile } from "./keyslot-custody.js";
import type { KeyslotFile } from "./keyslots.js";

export function resolveKeyslotPath(dataDir: string): string {
  return path.join(dataDir, KEYSLOTS_FILENAME);
}

export function readKeyslotFile(filePath: string): KeyslotFile | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as KeyslotFile;
  assertKeyslotFile(parsed);
  return parsed;
}

export function writeKeyslotFile(filePath: string, file: KeyslotFile): void {
  assertKeyslotFile(file);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(tmp, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Windows may ignore mode bits on rename; best-effort.
  }
}
