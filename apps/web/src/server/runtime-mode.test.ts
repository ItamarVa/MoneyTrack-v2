import { afterEach, describe, expect, it } from "vitest";
import { getRuntimeMode, isHaAddonMode } from "./runtime-mode";

describe("runtime-mode", () => {
  const prev = process.env.MONEYTRACK_MODE;

  afterEach(() => {
    process.env.MONEYTRACK_MODE = prev;
  });

  it("defaults to dev", () => {
    delete process.env.MONEYTRACK_MODE;
    expect(getRuntimeMode()).toBe("dev");
    expect(isHaAddonMode()).toBe(false);
  });

  it("detects ha-addon from MONEYTRACK_MODE", () => {
    process.env.MONEYTRACK_MODE = "ha-addon";
    expect(getRuntimeMode()).toBe("ha-addon");
    expect(isHaAddonMode()).toBe(true);
  });
});
