import { afterEach, describe, expect, it } from "vitest";
import { apiUrl, assetUrl, getBasePath, INGRESS_BASE_PLACEHOLDER } from "./base-path";

describe("base-path", () => {
  const prev = process.env.NEXT_PUBLIC_MONEYTRACK_BASE_PATH;

  afterEach(() => {
    process.env.NEXT_PUBLIC_MONEYTRACK_BASE_PATH = prev;
  });

  it("returns empty base in dev", () => {
    process.env.NEXT_PUBLIC_MONEYTRACK_BASE_PATH = "";
    expect(getBasePath()).toBe("");
    expect(apiUrl("/api/auth/session")).toBe("/api/auth/session");
  });

  it("prefixes api and asset paths under ingress", () => {
    const ingress = "/api/hassio_ingress/abc123";
    process.env.NEXT_PUBLIC_MONEYTRACK_BASE_PATH = ingress;
    expect(getBasePath()).toBe(ingress);
    expect(apiUrl("/api/dashboard/home")).toBe(`${ingress}/api/dashboard/home`);
    expect(assetUrl("/brand/mark.png")).toBe(`${ingress}/brand/mark.png`);
  });

  it("keeps the build placeholder, which is Next's basePath until replaced", () => {
    process.env.NEXT_PUBLIC_MONEYTRACK_BASE_PATH = INGRESS_BASE_PLACEHOLDER;
    expect(getBasePath()).toBe(INGRESS_BASE_PLACEHOLDER);
    expect(apiUrl("/api/ha/status")).toBe(`${INGRESS_BASE_PLACEHOLDER}/api/ha/status`);
  });
});
