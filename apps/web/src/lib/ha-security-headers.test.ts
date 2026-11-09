import { afterEach, describe, expect, it } from "vitest";
import {
  buildStaticSecurityHeaders,
  cspFrameAncestorsDirective,
  isHaAddonEmbedMode,
} from "./ha-security-headers";

describe("ha-security-headers", () => {
  const prev = process.env.MONEYTRACK_MODE;

  afterEach(() => {
    process.env.MONEYTRACK_MODE = prev;
  });

  it("defaults to dev framing lockdown", () => {
    delete process.env.MONEYTRACK_MODE;
    expect(isHaAddonEmbedMode()).toBe(false);
    expect(cspFrameAncestorsDirective()).toBe("frame-ancestors 'none'");
    const keys = buildStaticSecurityHeaders().map((h) => h.key);
    expect(keys).toContain("X-Frame-Options");
  });

  it("relaxes framing for ha-addon ingress iframe", () => {
    process.env.MONEYTRACK_MODE = "ha-addon";
    expect(isHaAddonEmbedMode()).toBe(true);
    expect(cspFrameAncestorsDirective()).toBe("frame-ancestors 'self'");
    const xfo = buildStaticSecurityHeaders().find((h) => h.key === "X-Frame-Options");
    expect(xfo?.value).toBe("SAMEORIGIN");
  });
});
