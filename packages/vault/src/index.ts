import {
  deleteSecretFile,
  loadSecretFile,
  resolveFileVaultMasterKey,
  storeSecretFile,
  type VaultTarget,
} from "./file-vault.js";
import {
  deleteSecretKeyring,
  getOrCreateMasterKeyKeyring,
  loadSecretKeyring,
  MASTER_KEY_TARGET,
  storeSecretKeyring,
} from "./keyring-backend.js";
import {
  clearDbKeyFromShm,
  readDbKeyFromShm,
  resolveShmDbKeyPath,
  waitForDbKeyInShm,
  writeDbKeyToShm,
} from "./shm-db-key.js";

export type { VaultTarget };
export { MASTER_KEY_TARGET };
export {
  clearDbKeyFromShm,
  readDbKeyFromShm,
  resolveShmDbKeyPath,
  waitForDbKeyInShm,
  writeDbKeyToShm,
};

export { resolveDataDir, resolveSecretsDir } from "./paths.js";

function isFileVaultBackend(): boolean {
  return process.env.MONEYTRACK_VAULT === "file";
}

function isHaAddonMode(): boolean {
  return process.env.MONEYTRACK_MODE === "ha-addon";
}

async function resolveDbKeyForVault(): Promise<Buffer> {
  if (isHaAddonMode()) {
    const shm = readDbKeyFromShm();
    if (shm) {
      return shm;
    }
    throw new Error("Database is locked: unlock key not in shared memory");
  }
  if (isFileVaultBackend()) {
    try {
      return resolveFileVaultMasterKey();
    } catch {
      return getOrCreateMasterKeyKeyring();
    }
  }
  return getOrCreateMasterKeyKeyring();
}

export async function storeSecret(target: VaultTarget, value: string): Promise<void> {
  if (isFileVaultBackend()) {
    const dbKey = await resolveDbKeyForVault();
    await storeSecretFile(target, value, dbKey);
    return;
  }
  await storeSecretKeyring(target, value);
}

export async function loadSecret(target: VaultTarget): Promise<string> {
  if (isFileVaultBackend()) {
    const dbKey = await resolveDbKeyForVault();
    return loadSecretFile(target, dbKey);
  }
  return loadSecretKeyring(target);
}

export async function deleteSecret(target: VaultTarget): Promise<void> {
  if (isFileVaultBackend()) {
    await deleteSecretFile(target);
    return;
  }
  await deleteSecretKeyring(target);
}

/** 32-byte SQLCipher key; HA add-on reads from shm only, dev uses Credential Manager. */
export async function getOrCreateMasterKey(): Promise<Buffer> {
  if (isHaAddonMode()) {
    const key = readDbKeyFromShm();
    if (!key) {
      throw new Error("Database is locked: unlock key not in shared memory");
    }
    return key;
  }
  return getOrCreateMasterKeyKeyring();
}
