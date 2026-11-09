import { beforeEach, describe, expect, it } from "vitest";
import {
  EgressDeniedError,
  clearEgressLog,
  egressFetch,
  getEgressLog,
  isHostAllowlisted,
} from "./index.js";

describe("egress allowlist", () => {
  beforeEach(() => {
    clearEgressLog();
  });

  it("allows listed hosts", () => {
    expect(isHostAllowlisted("boi.org.il")).toBe(true);
    expect(isHostAllowlisted("www.boi.org.il")).toBe(true);
    expect(isHostAllowlisted("api.cbs.gov.il")).toBe(true);
  });

  it("rejects random hosts", async () => {
    expect(isHostAllowlisted("evil.example.com")).toBe(false);
    await expect(
      egressFetch("https://evil.example.com/x", "test"),
    ).rejects.toThrow(EgressDeniedError);
  });

  it("accepts allowlisted frankfurter URL shape", () => {
    const url = new URL("https://api.frankfurter.dev/latest?from=USD&to=ILS");
    expect(isHostAllowlisted(url.hostname)).toBe(true);
    expect(getEgressLog()).toEqual([]);
  });
});
