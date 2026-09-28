import { describe, expect, it, vi } from "vitest";

const createScraperMock = vi.hoisted(() =>
  vi.fn(() => ({
    scrape: vi.fn(async () => ({ success: true, accounts: [] })),
  })),
);

vi.mock("israeli-bank-scrapers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("israeli-bank-scrapers")>();
  return {
    ...actual,
    createScraper: createScraperMock,
  };
});

import { OfficialScraperAdapter } from "./official-scraper-adapter.js";

describe("OfficialScraperAdapter scrape options", () => {
  it("disables scraper date filter and caps Chromium disk cache", async () => {
    createScraperMock.mockClear();
    const adapter = new OfficialScraperAdapter("isracard");
    await adapter.scrape(
      { id: "conn", providerCode: "isracard", puppeteerProfileDir: "/tmp/profile" },
      { id: "u", password: "secret" },
      {
        startDate: new Date("2026-01-01"),
        combineInstallments: false,
        puppeteerUserDataDir: "/tmp/profile",
      },
    );

    expect(createScraperMock).toHaveBeenCalledOnce();
    type ScraperOpts = {
      outputData?: { enableTransactionsFilterByDate?: boolean };
      args?: string[];
    };
    const mockFn = createScraperMock as unknown as {
      mock: { calls: Array<[ScraperOpts]> };
    };
    const firstCall = mockFn.mock.calls[0];
    expect(firstCall).toBeDefined();
    const options = firstCall![0];
    expect(options.outputData).toEqual({ enableTransactionsFilterByDate: false });
    expect(options.args).toContain("--disk-cache-size=33554432");
    expect(options.args).toContain("--user-data-dir=/tmp/profile");
  });
});
