/**
 * Web-side shim for Track A vault shm DB key handoff (agent polls the same path).
 */
import {
  clearDbKeyFromShm,
  readDbKeyFromShm,
  writeDbKeyToShm,
} from "@moneytrack/vault";

export function isDbKeyPresent(): boolean {
  return readDbKeyFromShm() !== null;
}

export function readDbKey(): Buffer | null {
  return readDbKeyFromShm();
}

export function writeDbKey(key: Buffer): void {
  writeDbKeyToShm(key);
}

export function clearDbKey(): void {
  clearDbKeyFromShm();
}
