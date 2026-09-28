import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateKey } from "@moneytrack/crypto";
import { deleteSecret, loadSecret, storeSecret } from "./index.js";

describe("file vault backend", () => {
  let tmpDir: string;
  let previousVault: string | undefined;
  let previousDataDir: string | undefined;
  let previousFileKey: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-vault-"));
    previousVault = process.env.MONEYTRACK_VAULT;
    previousDataDir = process.env.MONEYTRACK_DATA_DIR;
    previousFileKey = process.env.MONEYTRACK_VAULT_FILE_KEY;
    process.env.MONEYTRACK_VAULT = "file";
    process.env.MONEYTRACK_DATA_DIR = tmpDir;
    process.env.MONEYTRACK_VAULT_FILE_KEY = Buffer.from(generateKey()).toString("base64");
  });

  afterEach(() => {
    if (previousVault === undefined) {
      delete process.env.MONEYTRACK_VAULT;
    } else {
      process.env.MONEYTRACK_VAULT = previousVault;
    }
    if (previousDataDir === undefined) {
      delete process.env.MONEYTRACK_DATA_DIR;
    } else {
      process.env.MONEYTRACK_DATA_DIR = previousDataDir;
    }
    if (previousFileKey === undefined) {
      delete process.env.MONEYTRACK_VAULT_FILE_KEY;
    } else {
      process.env.MONEYTRACK_VAULT_FILE_KEY = previousFileKey;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("round-trips a secret under data/secrets", async () => {
    const target = "moneytrack/conn/test-connection";
    await storeSecret(target, JSON.stringify({ password: "hunter2" }));
    const loaded = await loadSecret(target);
    expect(JSON.parse(loaded)).toEqual({ password: "hunter2" });
    await deleteSecret(target);
    await expect(loadSecret(target)).rejects.toThrow(/not found/);
  });
});
