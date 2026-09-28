import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  assertLoopbackBind,
  assertSafeDataDir,
  isCloudSyncedPath,
  StartupGuardError,
} from "./guards.js";

describe("startup guards", () => {
  let previousOverride: string | undefined;

  beforeEach(() => {
    previousOverride = process.env.MONEYTRACK_ALLOW_CLOUD_DATA;
    delete process.env.MONEYTRACK_ALLOW_CLOUD_DATA;
  });

  afterEach(() => {
    if (previousOverride === undefined) {
      delete process.env.MONEYTRACK_ALLOW_CLOUD_DATA;
    } else {
      process.env.MONEYTRACK_ALLOW_CLOUD_DATA = previousOverride;
    }
  });

  it("detects cloud-sync paths", () => {
    expect(isCloudSyncedPath("C:\\Users\\x\\OneDrive\\data")).toBe(true);
    expect(isCloudSyncedPath("C:\\MoneyTrack\\data")).toBe(false);
    expect(isCloudSyncedPath("/home/user/OneDrive/MoneyTrack")).toBe(true);
    expect(isCloudSyncedPath("/data/moneytrack")).toBe(false);
  });

  it("rejects cloud-sync data dir", () => {
    expect(() => assertSafeDataDir("C:\\Users\\x\\Dropbox\\MoneyTrack")).toThrow(
      StartupGuardError,
    );
  });

  it("allows a cloud-sync data dir when explicitly overridden", () => {
    process.env.MONEYTRACK_ALLOW_CLOUD_DATA = "1";
    expect(() => assertSafeDataDir("C:\\Users\\x\\Dropbox\\MoneyTrack")).not.toThrow();
  });

  it("rejects 0.0.0.0 bind", () => {
    expect(() => assertLoopbackBind("0.0.0.0")).toThrow(StartupGuardError);
    expect(() => assertLoopbackBind("127.0.0.1")).not.toThrow();
  });
});
