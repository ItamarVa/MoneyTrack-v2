/**
 * HA add-on DB key wrapping: Argon2id-derived KEK + AES-256-GCM slots.
 * Persisted shape lives in keyslots.ts; I/O in keyslot-file.ts.
 */

import { randomBytes } from "node:crypto";
import { Algorithm, hashRaw } from "@node-rs/argon2";
import {
  KEYSLOT_FILE_VERSION,
  type KeyslotEntry,
  type KeyslotFile,
  type KeyslotKind,
} from "./keyslots.js";
import { decrypt, encrypt, generateKey } from "./symmetric.js";

/** Recovery slot userId sentinel (not a real MoneyTrack user). */
export const RECOVERY_SLOT_USER_ID = "00000000-0000-4000-8000-000000000000";

export const KEYSLOTS_FILENAME = "keyslots.json";

export const ARGON2_KEK_OPTIONS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
  algorithm: Algorithm.Argon2id,
};

export class KeyslotUnlockError extends Error {
  constructor(message = "Could not unlock keyslot") {
    super(message);
    this.name = "KeyslotUnlockError";
  }
}

export function generateKeyslotSalt(): string {
  return randomBytes(16).toString("base64");
}

/** Shown once at enrollment; min length satisfies HaEnrollResponseSchema. */
export function generateRecoveryKey(): string {
  return randomBytes(24).toString("base64url");
}

export async function deriveSlotKek(
  secret: string,
  saltB64: string,
): Promise<Uint8Array> {
  const salt = Buffer.from(saltB64, "base64");
  if (salt.length < 8) {
    throw new Error("Invalid keyslot salt");
  }
  const raw = await hashRaw(secret, { ...ARGON2_KEK_OPTIONS, salt });
  return new Uint8Array(raw);
}

function wrapDbKeyWithKek(dbKey: Uint8Array, kek: Uint8Array): string {
  const plaintext = Buffer.from(dbKey).toString("base64");
  return encrypt(kek, plaintext);
}

function unwrapDbKeyWithKek(wrappedDbKey: string, kek: Uint8Array): Uint8Array {
  const plaintext = decrypt(kek, wrappedDbKey);
  const key = Buffer.from(plaintext, "base64");
  if (key.length !== 32) {
    throw new KeyslotUnlockError("Unwrapped DB key has invalid length");
  }
  return new Uint8Array(key);
}

export async function createPassphraseSlot(
  userId: string,
  passphrase: string,
  dbKey: Uint8Array,
): Promise<KeyslotEntry> {
  const salt = generateKeyslotSalt();
  const kek = await deriveSlotKek(passphrase, salt);
  return {
    kind: "passphrase",
    userId,
    salt,
    wrappedDbKey: wrapDbKeyWithKek(dbKey, kek),
    createdAt: new Date().toISOString(),
  };
}

export async function createRecoverySlot(
  recoveryKey: string,
  dbKey: Uint8Array,
): Promise<KeyslotEntry> {
  const salt = generateKeyslotSalt();
  const kek = await deriveSlotKek(recoveryKey, salt);
  return {
    kind: "recovery",
    userId: RECOVERY_SLOT_USER_ID,
    salt,
    wrappedDbKey: wrapDbKeyWithKek(dbKey, kek),
    createdAt: new Date().toISOString(),
  };
}

export async function unwrapKeyslotEntry(
  entry: KeyslotEntry,
  secret: string,
): Promise<Uint8Array> {
  try {
    const kek = await deriveSlotKek(secret, entry.salt);
    return unwrapDbKeyWithKek(entry.wrappedDbKey, kek);
  } catch (error) {
    if (error instanceof KeyslotUnlockError) {
      throw error;
    }
    throw new KeyslotUnlockError();
  }
}

export function findPassphraseSlot(
  file: KeyslotFile,
  userId: string,
): KeyslotEntry | undefined {
  return file.slots.find((s) => s.kind === "passphrase" && s.userId === userId);
}

export function findRecoverySlot(file: KeyslotFile): KeyslotEntry | undefined {
  return file.slots.find((s) => s.kind === "recovery");
}

/** First enrollment: random DB key + passphrase + recovery slots. */
export async function createInitialKeyslotFile(
  userId: string,
  passphrase: string,
  recoveryKey: string,
): Promise<{ file: KeyslotFile; dbKey: Uint8Array; recoveryKey: string }> {
  const dbKey = generateKey();
  const passphraseSlot = await createPassphraseSlot(userId, passphrase, dbKey);
  const recoverySlot = await createRecoverySlot(recoveryKey, dbKey);
  const file: KeyslotFile = {
    version: KEYSLOT_FILE_VERSION,
    slots: [passphraseSlot, recoverySlot],
  };
  return { file, dbKey, recoveryKey };
}

export async function addPassphraseSlotToFile(
  file: KeyslotFile,
  userId: string,
  passphrase: string,
  dbKey: Uint8Array,
): Promise<KeyslotFile> {
  const withoutUser = file.slots.filter(
    (s) => !(s.kind === "passphrase" && s.userId === userId),
  );
  const slot = await createPassphraseSlot(userId, passphrase, dbKey);
  return { ...file, slots: [...withoutUser, slot] };
}

export function assertKeyslotFile(file: KeyslotFile): void {
  if (file.version !== KEYSLOT_FILE_VERSION) {
    throw new Error(`Unsupported keyslots version: ${file.version}`);
  }
  for (const slot of file.slots) {
    assertSlotKind(slot.kind);
  }
}

function assertSlotKind(kind: KeyslotKind): void {
  if (kind !== "passphrase" && kind !== "recovery") {
    throw new Error(`Invalid keyslot kind: ${kind}`);
  }
}
