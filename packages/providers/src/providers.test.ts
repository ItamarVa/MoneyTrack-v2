import { describe, expect, it } from "vitest";
import { PROVIDER_CATALOG } from "@moneytrack/contracts";
import { SCRAPERS } from "israeli-bank-scrapers/lib/definitions.js";
import { mapScraperTransaction } from "./map-transaction.js";
import { isOfficialProvider } from "./official-scraper-adapter.js";

/** Fields the scraper supplies itself during the OTP handshake. */
const NON_INPUT_FIELDS = new Set(["otpCodeRetriever", "otpLongTermToken"]);

describe("provider mapping", () => {
  it("maps scraper rows to RawTransactionPayload fields", () => {
    const payload = mapScraperTransaction("9999", {
      type: "installments",
      identifier: 42,
      date: "2026-03-01T00:00:00.000Z",
      processedDate: "2026-03-02T00:00:00.000Z",
      originalAmount: -300,
      originalCurrency: "ILS",
      chargedAmount: -300,
      description: "TEST MERCHANT",
      installments: { number: 1, total: 3 },
      status: "completed",
    });

    expect(payload.installmentIndex).toBe(1);
    expect(payload.installmentTotal).toBe(3);
    expect(payload.scraperIdentifier).toBe(42);
    expect(payload.status).toBe("posted");
    expect(payload.payload.identifier).toBe(42);
  });

  it("uses originalAmount when chargedAmount is zero on pending ILS rows", () => {
    const payload = mapScraperTransaction("1234", {
      date: "2026-09-01T00:00:00.000Z",
      originalAmount: -89.9,
      originalCurrency: "ILS",
      chargedAmount: 0,
      description: "BIT",
      status: "pending",
    });

    expect(payload.amountIls).toBe(89.9);
    expect(payload.direction).toBe("debit");
    expect(payload.kind).toBe("expense");
  });

  it("keeps amountIls at zero for foreign rows until FX converts", () => {
    const payload = mapScraperTransaction("1234", {
      date: "2026-09-01T00:00:00.000Z",
      originalAmount: -12.5,
      originalCurrency: "USD",
      chargedAmount: 0,
      description: "EXAMPLE STORE",
      status: "pending",
    });

    expect(payload.amountIls).toBe(0);
    expect(payload.originalAmount).toBe(12.5);
    expect(payload.originalCurrency).toBe("USD");
  });
});

describe("provider catalog", () => {
  it("covers every company the scraper library supports", () => {
    const catalogCodes = PROVIDER_CATALOG.map((entry) => entry.code).sort();
    expect(catalogCodes).toEqual(Object.keys(SCRAPERS).sort());
  });

  it("asks for exactly the login fields the scraper library expects", () => {
    for (const entry of PROVIDER_CATALOG) {
      const expected = SCRAPERS[entry.code as keyof typeof SCRAPERS].loginFields.filter(
        (field: string) => !NON_INPUT_FIELDS.has(field),
      );
      expect(entry.loginFields, entry.code).toEqual(expected);
    }
  });

  it("resolves every catalog code to a scraper adapter", () => {
    for (const entry of PROVIDER_CATALOG) {
      expect(isOfficialProvider(entry.code), entry.code).toBe(true);
    }
  });
});
