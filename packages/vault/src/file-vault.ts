/**
 * File-backed credential vault: AES-GCM blobs under data/secrets, HKDF from the SQLCipher DB key.
 */

import { createHash, hkdfSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { decrypt, encrypt } from "@moneytrack/crypto";
import { resolveSecretsDir } from "./paths.js";

export type VaultTarget = string;

const HKDF_INFO = "moneytrack-vault-secret-v1";

function secretFilePath(target: VaultTarget, secretsDir: string): string {
  const digest = createHash("sha256").update(target, "utf8").digest("hex");
  return path.join(secretsDir, `${digest}.gcm`);
}

function deriveSecretKey(dbKey: Buffer, target: VaultTarget): Uint8Array {
  const salt = createHash("sha256").update(target, "utf8").digest();
  return new Uint8Array(
    hkdfSync("sha256", dbKey, salt, HKDF_INFO, 32),
  );
}

export function resolveFileVaultMasterKey(): Buffer {
  const fromEnv = process.env.MONEYTRACK_VAULT_FILE_KEY;
  if (fromEnv) {
    const key = Buffer.from(fromEnv, "base64");
    if (key.length !== 32) {
      throw new Error("MONEYTRACK_VAULT_FILE_KEY must be 32 bytes base64");
    }
    return key;
  }
  throw new Error("File vault requires an active DB encryption key");
}

export async function storeSecretFile(
  target: VaultTarget,
  value: string,
  dbKey: Buffer,
  dataDir?: string,
): Promise<void> {
  const secretsDir = resolveSecretsDir(dataDir);
  fs.mkdirSync(secretsDir, { recursive: true });
  const key = deriveSecretKey(dbKey, target);
  const ciphertext = encrypt(key, value);
  const filePath = secretFilePath(target, secretsDir);
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, ciphertext, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, filePath);
}

export async function loadSecretFile(
  target: VaultTarget,
  dbKey: Buffer,
  dataDir?: string,
): Promise<string> {
  const secretsDir = resolveSecretsDir(dataDir);
  const filePath = secretFilePath(target, secretsDir);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Vault secret not found: ${target}`);
  }
  const ciphertext = fs.readFileSync(filePath, "utf8");
  const key = deriveSecretKey(dbKey, target);
  return decrypt(key, ciphertext);
}

export async function deleteSecretFile(
  target: VaultTarget,
  dataDir?: string,
): Promise<void> {
  const secretsDir = resolveSecretsDir(dataDir);
  const filePath = secretFilePath(target, secretsDir);
  try {
    fs.unlinkSync(filePath);
  } catch {
    // absent
  }
}
