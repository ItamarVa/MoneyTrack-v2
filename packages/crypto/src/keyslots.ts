/**
 * On-disk keyslot file shape for HA add-on custody (Track A implements read/write).
 * Each slot wraps the same 32-byte DB key with AES-256-GCM under a user KEK or recovery key.
 */

export const KEYSLOT_FILE_VERSION = 1;

export type KeyslotKind = "passphrase" | "recovery";

/** Base64-encoded salt for Argon2id KEK derivation (per slot). */
export type KeyslotSaltB64 = string;

/** Base64 AES-256-GCM blob produced by @moneytrack/crypto encrypt(). */
export type WrappedDbKeyB64 = string;

export interface KeyslotEntry {
  kind: KeyslotKind;
  /** MoneyTrack user id (UUID); recovery slot uses a fixed sentinel id. */
  userId: string;
  /**
   * HA user id owning a passphrase slot (add-on mode). Optional so older files
   * still parse; lets unlock find the slot before the DB can be opened.
   */
  haUserId?: string;
  salt: KeyslotSaltB64;
  wrappedDbKey: WrappedDbKeyB64;
  createdAt: string;
}

export interface KeyslotFile {
  version: typeof KEYSLOT_FILE_VERSION;
  slots: KeyslotEntry[];
}
