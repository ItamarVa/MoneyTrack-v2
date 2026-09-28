import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { middleware } from "./middleware";

function cspFor(pathname: string): string {
  const response = middleware(new NextRequest(`http://127.0.0.1:3100${pathname}`));
  return response.headers.get("content-security-policy") ?? "";
}

describe("content security policy", () => {
  it("issues a real nonce instead of a build-time placeholder", () => {
    const csp = cspFor("/login");
    expect(csp).not.toContain("__CSP_NONCE__");
    expect(csp).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]{16,}'/);
  });

  it("issues a fresh nonce per request", () => {
    expect(cspFor("/login")).not.toEqual(cspFor("/login"));
  });

  it("keeps scripts and framing locked down", () => {
    const csp = cspFor("/login");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  describe("ha-addon embed mode", () => {
    const prev = process.env.MONEYTRACK_MODE;

    afterEach(() => {
      process.env.MONEYTRACK_MODE = prev;
    });

    it("allows same-origin framing for ingress iframe", () => {
      process.env.MONEYTRACK_MODE = "ha-addon";
      const csp = cspFor("/login");
      expect(csp).toContain("frame-ancestors 'self'");
      expect(csp).not.toContain("frame-ancestors 'none'");
    });

    it("leaves the gate choice to the (app) layout instead of the desktop login", () => {
      process.env.MONEYTRACK_MODE = "ha-addon";
      const response = middleware(new NextRequest("http://127.0.0.1:3100/dashboard"));
      expect(response.headers.get("location")).toBeNull();
    });
  });

  it("sends the policy on the login redirect for signed-out visitors", () => {
    const response = middleware(new NextRequest("http://127.0.0.1:3100/dashboard"));
    expect(response.headers.get("location")).toContain("/login");
    expect(response.headers.get("content-security-policy")).toContain("'nonce-");
  });
});

describe("protected pages", () => {
  it.each([
    "/dashboard",
    "/transactions",
    "/accounts",
    "/analysis",
    "/categories/00000000-0000-4000-8000-000000000010",
    "/classify",
    "/entities/person/00000000-0000-4000-8000-000000000001",
    "/settings",
    "/alerts",
    "/loans",
    "/networth",
    "/change-password",
  ])("redirects %s to login without a session cookie", (pathname) => {
    const response = middleware(new NextRequest(`http://127.0.0.1:3100${pathname}`));
    expect(response.headers.get("location")).toContain("/login");
  });

  it("lets the login page through", () => {
    const response = middleware(new NextRequest("http://127.0.0.1:3100/login"));
    expect(response.headers.get("location")).toBeNull();
  });
});
