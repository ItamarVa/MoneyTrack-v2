import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  KeyslotUnlockError,
  createInitialKeyslotFile,
  createPassphraseSlot,
  findPassphraseSlot,
  findRecoverySlot,
  generateRecoveryKey,
  unwrapKeyslotEntry,
} from "./keyslot-custody.js";
import { readKeyslotFile, resolveKeyslotPath, writeKeyslotFile } from "./keyslot-file.js";
import { generateKey } from "./symmetric.js";

describe("keyslot custody", () => {
  it("wraps and unwraps with passphrase and recovery key", async () => {
    const userId = randomUUID();
    const passphrase = "correct horse battery staple";
    const recoveryKey = generateRecoveryKey();
    const { file, dbKey } = await createInitialKeyslotFile(userId, passphrase, recoveryKey);

    const passSlot = findPassphraseSlot(file, userId);
    const recoverySlot = findRecoverySlot(file);
    expect(passSlot).toBeDefined();
    expect(recoverySlot).toBeDefined();

    const fromPass = await unwrapKeyslotEntry(passSlot!, passphrase);
    const fromRecovery = await unwrapKeyslotEntry(recoverySlot!, recoveryKey);
    expect(Buffer.from(fromPass)).toEqual(Buffer.from(dbKey));
    expect(Buffer.from(fromRecovery)).toEqual(Buffer.from(dbKey));
  });

  it("rejects wrong passphrase", async () => {
    const userId = randomUUID();
    const { file } = await createInitialKeyslotFile(
      userId,
      "real passphrase here",
      generateRecoveryKey(),
    );
    const slot = findPassphraseSlot(file, userId)!;
    await expect(unwrapKeyslotEntry(slot, "wrong passphrase here")).rejects.toBeInstanceOf(
      KeyslotUnlockError,
    );
  });

  it("persists keyslots.json round-trip", async () => {
    const userId = randomUUID();
    const recoveryKey = generateRecoveryKey();
    const { file } = await createInitialKeyslotFile(userId, "persist me please", recoveryKey);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-keyslots-"));
    try {
      const filePath = resolveKeyslotPath(dir);
      writeKeyslotFile(filePath, file);
      const loaded = readKeyslotFile(filePath);
      expect(loaded?.slots).toHaveLength(2);
      const slot = findPassphraseSlot(loaded!, userId)!;
      const key = await unwrapKeyslotEntry(slot, "persist me please");
      expect(key).toHaveLength(32);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("re-wraps the same db key for a second user slot", async () => {
    const dbKey = generateKey();
    const slotA = await createPassphraseSlot(randomUUID(), "user-a-passphrase", dbKey);
    const slotB = await createPassphraseSlot(randomUUID(), "user-b-passphrase", dbKey);
    const a = await unwrapKeyslotEntry(slotA, "user-a-passphrase");
    const b = await unwrapKeyslotEntry(slotB, "user-b-passphrase");
    expect(Buffer.from(a)).toEqual(Buffer.from(b));
  });
});
