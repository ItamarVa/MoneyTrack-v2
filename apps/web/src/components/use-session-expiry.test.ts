import { describe, expect, it } from "vitest";
import { shouldReloadForExpiredSession } from "./use-session-expiry";

describe("shouldReloadForExpiredSession", () => {
  it("reloads on 401 from an api call", () => {
    expect(shouldReloadForExpiredSession(401, "/api/accounts", "/accounts")).toBe(true);
  });

  it("reloads on 401 from an ingress-prefixed api url", () => {
    expect(
      shouldReloadForExpiredSession(401, "/api/hassio_ingress/abc123/api/classify/status", "/api/hassio_ingress/abc123/credit"),
    ).toBe(true);
    expect(
      shouldReloadForExpiredSession(401, "https://ha.local/ingress/x/api/accounts?a=1", "/ingress/x/accounts"),
    ).toBe(true);
  });

  it("ignores non-api urls", () => {
    expect(shouldReloadForExpiredSession(401, "/credit", "/credit")).toBe(false);
  });

  it("ignores 403 and 200", () => {
    expect(shouldReloadForExpiredSession(403, "/api/accounts", "/accounts")).toBe(false);
    expect(shouldReloadForExpiredSession(200, "/api/accounts", "/accounts")).toBe(false);
  });

  it("ignores auth pages", () => {
    expect(shouldReloadForExpiredSession(401, "/api/ha/pin", "/ha/pin")).toBe(false);
    expect(shouldReloadForExpiredSession(401, "/api/ha/unlock", "/ingress/x/ha/unlock")).toBe(false);
    expect(shouldReloadForExpiredSession(401, "/api/auth/login", "/login")).toBe(false);
  });
});
