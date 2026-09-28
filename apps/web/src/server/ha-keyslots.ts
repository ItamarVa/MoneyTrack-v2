/**
 * HA keyslot persistence: /data/keyslots.json wraps the SQLCipher key once per
 * user passphrase plus one recovery slot (ADR-007). Crypto owns wrap/unwrap.
 * Passphrase slots carry the HA user id so unlock can find them before the DB
 * opens. Invariant: vault creation never overwrites an existing keyslots file.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveDataDir } from "@moneytrack/db";
import {
  createInitialKeyslotFile,
  createPassphraseSlot,
  findRecoverySlot,
  generateRecoveryKey,
  readKeyslotFile as readKeyslotFileAt,
  resolveKeyslotPath,
  unwrapKeyslotEntry,
  writeKeyslotFile as writeKeyslotFileAt,
  type KeyslotEntry,
  type KeyslotFile,
} from "@moneytrack/crypto";

export class KeyslotsExistError extends Error {
  constructor() {
    super("Keyslots already exist");
    this.name = "KeyslotsExistError";
  }
}

export function keyslotsFilePath(): string {
  return resolveKeyslotPath(resolveDataDir());
}

export function readKeyslotFile(): KeyslotFile | null {
  return readKeyslotFileAt(keyslotsFilePath());
}

export function writeKeyslotFile(file: KeyslotFile): void {
  writeKeyslotFileAt(keyslotsFilePath(), file);
}

/** link() fails with EEXIST instead of replacing, so only one creator can win. */
function writeKeyslotFileExclusive(file: KeyslotFile): void {
  const filePath = keyslotsFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${randomUUID()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(file, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    fs.linkSync(tmp, filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new KeyslotsExistError();
    }
    throw error;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

export function findUserSlot(file: KeyslotFile, haUserId: string): KeyslotEntry | undefined {
  return file.slots.find((slot) => slot.kind === "passphrase" && slot.haUserId === haUserId);
}

/** New random DB key with the first user's slot and the recovery slot. */
export async function createVaultKeyslots(
  userId: string,
  haUserId: string,
  passphrase: string,
): Promise<{ recoveryKey: string; dbKey: Buffer }> {
  const recoveryKey = generateRecoveryKey();
  const { file, dbKey } = await createInitialKeyslotFile(userId, passphrase, recoveryKey);
  const slots = file.slots.map((slot) =>
    slot.kind === "passphrase" ? { ...slot, haUserId } : slot,
  );
  writeKeyslotFileExclusive({ ...file, slots });
  return { recoveryKey, dbKey: Buffer.from(dbKey) };
}

export async function unwrapUserSlot(
  haUserId: string,
  passphrase: string,
): Promise<{ userId: string; dbKey: Buffer } | null> {
  const file = readKeyslotFile();
  const slot = file ? findUserSlot(file, haUserId) : undefined;
  if (!slot) {
    return null;
  }
  try {
    return { userId: slot.userId, dbKey: Buffer.from(await unwrapKeyslotEntry(slot, passphrase)) };
  } catch {
    return null;
  }
}

export async function unwrapRecoverySlot(recoveryKey: string): Promise<Buffer | null> {
  const file = readKeyslotFile();
  const slot = file ? findRecoverySlot(file) : undefined;
  if (!slot) {
    return null;
  }
  try {
    return Buffer.from(await unwrapKeyslotEntry(slot, recoveryKey));
  } catch {
    return null;
  }
}

/** Adds or replaces this user's passphrase slot; needs the unlocked DB key. */
export async function setUserKeyslot(
  userId: string,
  haUserId: string,
  passphrase: string,
  dbKey: Buffer,
): Promise<void> {
  const file = readKeyslotFile();
  if (!file) {
    throw new Error("Keyslots not initialized");
  }
  const slot = { ...(await createPassphraseSlot(userId, passphrase, new Uint8Array(dbKey))), haUserId };
  const retained = file.slots.filter(
    (entry) =>
      !(entry.kind === "passphrase" && (entry.userId === userId || entry.haUserId === haUserId)),
  );
  writeKeyslotFile({ ...file, slots: [...retained, slot] });
}

export function removeUserKeyslot(userId: string): void {
  const file = readKeyslotFile();
  if (!file) {
    return;
  }
  writeKeyslotFile({
    ...file,
    slots: file.slots.filter((slot) => !(slot.kind === "passphrase" && slot.userId === userId)),
  });
}
