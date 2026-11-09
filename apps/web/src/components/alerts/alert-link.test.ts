import { describe, expect, it } from "vitest";
import { alertViewHref } from "./alert-link";

const base = { transactionId: "t1" as string | null };

describe("alertViewHref", () => {
  it("duplicate: merchant on that exact day", () => {
    const href = alertViewHref({ ...base, type: "duplicate", metadata: { merchantId: "m1", date: "2026-10-05" } });
    expect(href).toBe("/transactions?merchantIds=m1&dateFrom=2026-10-05&dateTo=2026-10-05");
  });
  it("anomaly: merchant history with the transaction highlighted", () => {
    expect(alertViewHref({ ...base, type: "anomaly", metadata: { merchantId: "m1" } })).toBe(
      "/transactions?merchantIds=m1&period=all&highlight=t1",
    );
  });
  it("price increase: all merchant charges", () => {
    expect(alertViewHref({ ...base, type: "price_increase", metadata: { merchantId: "m1" } })).toBe(
      "/transactions?merchantIds=m1&period=all",
    );
  });
  it("budget: category in the month, even when metadata is a JSON string", () => {
    const metadata = JSON.stringify({ categoryId: "c1", period: "2026-02" }) as unknown as Record<string, unknown>;
    expect(alertViewHref({ transactionId: null, type: "budget_variance", metadata })).toBe(
      "/transactions?categoryIds=c1&dateFrom=2026-02-01&dateTo=2026-02-28",
    );
  });
  it("falls back to the transaction, then to /alerts", () => {
    expect(alertViewHref({ ...base, type: "unmatched_settlement", metadata: null })).toBe(
      "/transactions?period=all&highlight=t1",
    );
    expect(alertViewHref({ transactionId: null, type: "anomaly", metadata: null })).toBe("/alerts");
  });
});
