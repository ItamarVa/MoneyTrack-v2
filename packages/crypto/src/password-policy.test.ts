import { describe, expect, it } from "vitest";
import { checkPassword, denylistSize, isCommonPassword } from "./password-policy.js";

describe("password denylist", () => {
  it("loads the bundled list", () => {
    expect(denylistSize()).toBeGreaterThan(1000);
  });

  it("rejects passwords a cracker tries first", () => {
    for (const password of ["password1", "12345678", "qwertyuiop", "letmein1"]) {
      expect(checkPassword(password)).toEqual({ ok: false, reason: "too_common" });
    }
  });

  it("is not fooled by capitalisation or surrounding space", () => {
    expect(isCommonPassword("PassWord1")).toBe(true);
    expect(isCommonPassword("  password1  ")).toBe(true);
  });

  it("holds no entry shorter than the schema minimum, which would be dead weight", () => {
    expect(isCommonPassword("123456")).toBe(false);
  });

  it("accepts a password that is merely unusual", () => {
    expect(checkPassword("tarnished-kettle-97")).toEqual({ ok: true });
  });
});

describe("similarity to the account", () => {
  it("rejects a password built from the app name", () => {
    expect(checkPassword("moneytrack2026")).toEqual({ ok: false, reason: "too_similar" });
  });

  it("rejects a password built from the username", () => {
    expect(checkPassword("admin-is-great", { username: "admin" })).toEqual({
      ok: false,
      reason: "too_similar",
    });
  });

  it("ignores a username too short to carry information", () => {
    expect(checkPassword("ab-quiet-harbour", { username: "ab" })).toEqual({ ok: true });
  });
});
