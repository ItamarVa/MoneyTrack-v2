import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  return {
    ...actual,
    fetch: (...args: Parameters<typeof actual.fetch>) => mockFetch(...args),
  };
});

import {
  EGRESS_ALLOWLIST,
  EgressDeniedError,
  clearEgressLog,
  egressFetch,
  getEgressLog,
  installEgressGuard,
  isHostAllowlisted,
} from "./index.js";

describe("egress integration — allowlist enforcement", () => {
  beforeEach(() => {
    clearEgressLog();
    mockFetch.mockReset();
  });

  it("rejects every non-allowlisted host before any network I/O", async () => {
    const blockedHosts = [
      "evil.example.com",
      "api.openai.com",
      "hooks.slack.com",
      "169.254.169.254",
      "metadata.google.internal",
    ];

    for (const host of blockedHosts) {
      expect(isHostAllowlisted(host)).toBe(false);
      await expect(egressFetch(`https://${host}/probe`, "integration_test")).rejects.toThrow(
        EgressDeniedError,
      );
    }
    expect(mockFetch).not.toHaveBeenCalled();
    expect(getEgressLog()).toEqual([]);
  });

  it("records only allowlisted hosts when fetch succeeds", async () => {
    const contacted = new Set<string>();
    mockFetch.mockImplementation(async (input: string | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      contacted.add(new URL(url).hostname);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const allowlistedUrl = "https://api.frankfurter.dev/latest?from=USD&to=ILS";
    expect(isHostAllowlisted("api.frankfurter.dev")).toBe(true);
    await egressFetch(allowlistedUrl, "integration_mock");

    expect([...contacted]).toEqual(["api.frankfurter.dev"]);
    expect(getEgressLog()).toHaveLength(1);
    expect(getEgressLog()[0]?.host).toBe("api.frankfurter.dev");
  });

  it("installEgressGuard blocks undici dispatch to non-allowlisted origins", () => {
    installEgressGuard();
    expect(EGRESS_ALLOWLIST.length).toBeGreaterThan(0);
    for (const host of EGRESS_ALLOWLIST) {
      expect(isHostAllowlisted(host)).toBe(true);
    }
  });
});
