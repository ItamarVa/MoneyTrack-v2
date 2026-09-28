import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAllowedUsersCache } from "@/server/ha-allowed-users";
import { keyslotsFilePath } from "@/server/ha-keyslots";
import { POST } from "./route";

const ENV_KEYS = ["MONEYTRACK_MODE", "MONEYTRACK_DATA_DIR", "MONEYTRACK_ALLOWED_USERS"] as const;

function enrollRequest(passphrase: string): Request {
  return new Request("http://127.0.0.1:8099/api/ha/enroll", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:8099",
      "x-forwarded-host": "127.0.0.1:8099",
      "x-remote-user-id": "ha-owner-id",
      "x-remote-user-name": "owner",
    },
    body: JSON.stringify({ passphrase, pin: "482915", recoveryKeyAcknowledged: true }),
  });
}

describe("POST /api/ha/enroll passphrase policy", () => {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  let dataDir = "";

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-ha-enroll-route-"));
    process.env.MONEYTRACK_MODE = "ha-addon";
    process.env.MONEYTRACK_DATA_DIR = dataDir;
    process.env.MONEYTRACK_ALLOWED_USERS = JSON.stringify(["owner"]);
    resetAllowedUsersCache();
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
    resetAllowedUsersCache();
  });

  it.each([
    ["Aa1!aaa", "passphrase_too_short"],
    ["aaaa1111!!!!", "passphrase_missing_classes"],
    ["Password1 ", "too_common"],
  ])("rejects %s with %s and creates no vault", async (passphrase, code) => {
    const response = await POST(enrollRequest(passphrase));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code });
    expect(fs.existsSync(keyslotsFilePath())).toBe(false);
  });

  it("rejects an over-long passphrase at the schema", async () => {
    const response = await POST(enrollRequest(`Aa1!${"a".repeat(300)}`));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "validation_error" });
  });
});
