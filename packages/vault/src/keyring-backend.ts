import { Entry } from "@napi-rs/keyring";
import { generateKey } from "@moneytrack/crypto";

export type VaultTarget = string;

const SERVICE = "moneytrack";
export const MASTER_KEY_TARGET = "master-db-key";

function parseTarget(target: VaultTarget): { service: string; account: string } {
  const slash = target.indexOf("/");
  if (slash === -1) {
    return { service: SERVICE, account: target };
  }
  return { service: target.slice(0, slash), account: target.slice(slash + 1) };
}

function entryFor(target: VaultTarget): Entry {
  const { service, account } = parseTarget(target);
  return new Entry(service, account);
}

export async function storeSecretKeyring(target: VaultTarget, value: string): Promise<void> {
  entryFor(target).setPassword(value);
}

export async function loadSecretKeyring(target: VaultTarget): Promise<string> {
  const password = entryFor(target).getPassword();
  if (!password) {
    throw new Error(`Vault secret not found: ${target}`);
  }
  return password;
}

export async function deleteSecretKeyring(target: VaultTarget): Promise<void> {
  entryFor(target).deletePassword();
}

/** 32-byte SQLCipher key; created on first run, stored base64 in Credential Manager. */
export async function getOrCreateMasterKeyKeyring(): Promise<Buffer> {
  const entry = entryFor(MASTER_KEY_TARGET);
  try {
    const stored = entry.getPassword();
    if (stored) {
      const key = Buffer.from(stored, "base64");
      if (key.length !== 32) {
        throw new Error("Stored master key has invalid length");
      }
      return key;
    }
  } catch {
    // not found — create below
  }
  const key = Buffer.from(generateKey());
  entry.setPassword(key.toString("base64"));
  return key;
}
