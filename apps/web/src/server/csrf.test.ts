import { describe, expect, it } from "vitest";
import { assertValidOrigin } from "./csrf";

function postRequest(headers: Record<string, string>): Request {
  return new Request("http://127.0.0.1:3100/api/auth/login", {
    method: "POST",
    headers,
  });
}

describe("assertValidOrigin", () => {
  it("ignores GET requests", () => {
    const req = new Request("http://127.0.0.1:3100/api/accounts", { method: "GET" });
    expect(() => assertValidOrigin(req)).not.toThrow();
  });

  it("accepts origin matching Host", () => {
    const req = postRequest({
      Origin: "http://127.0.0.1:3100",
      Host: "127.0.0.1:3100",
    });
    expect(() => assertValidOrigin(req)).not.toThrow();
  });

  it("prefers X-Forwarded-Host over Host for ingress", () => {
    const req = postRequest({
      Origin: "https://homeassistant.local:8123",
      Host: "127.0.0.1:3100",
      "X-Forwarded-Host": "homeassistant.local:8123",
    });
    expect(() => assertValidOrigin(req)).not.toThrow();
  });

  it("uses first forwarded host when a proxy chain is present", () => {
    const req = postRequest({
      Origin: "https://ingress.example",
      Host: "127.0.0.1:3100",
      "X-Forwarded-Host": "ingress.example, internal.local",
    });
    expect(() => assertValidOrigin(req)).not.toThrow();
  });

  it("rejects origin that does not match the effective host", () => {
    const req = postRequest({
      Origin: "https://evil.example",
      Host: "127.0.0.1:3100",
      "X-Forwarded-Host": "homeassistant.local:8123",
    });
    try {
      assertValidOrigin(req);
      expect.unreachable("expected 403 Response");
    } catch (err) {
      expect(err).toBeInstanceOf(Response);
      expect((err as Response).status).toBe(403);
    }
  });
});
