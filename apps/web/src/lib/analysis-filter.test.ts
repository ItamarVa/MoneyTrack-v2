import { describe, expect, it } from "vitest";
import {
  defaultTransactionsFilter,
  filterFromSearchParams,
  shiftMonth,
  transactionsFilterFromSearchParams,
} from "./analysis-filter";

describe("date basis defaults (owner 2026-11-04: month = what was charged)", () => {
  it("defaults the transactions list to charge basis", () => {
    expect(defaultTransactionsFilter().dateBasis).toBe("charge");
  });

  it("falls back to charge basis when the URL has no dates or basis", () => {
    const { filter } = transactionsFilterFromSearchParams(new URLSearchParams(""));
    expect(filter.dateBasis).toBe("charge");
  });

  it("keeps charge basis for the all-period view without an explicit basis", () => {
    const { filter, allPeriod } = transactionsFilterFromSearchParams(
      new URLSearchParams("period=all"),
    );
    expect(allPeriod).toBe(true);
    expect(filter.dateBasis).toBe("charge");
  });

  it("parses a URL without dateBasis as charge basis", () => {
    const filter = filterFromSearchParams(new URLSearchParams("dateFrom=2026-10-01&dateTo=2026-10-31"));
    expect(filter.dateBasis).toBe("charge");
  });

  it("keeps an explicit dateBasis=transaction from a bookmarked URL", () => {
    const filter = filterFromSearchParams(
      new URLSearchParams("dateFrom=2026-10-01&dateTo=2026-10-31&dateBasis=transaction"),
    );
    expect(filter.dateBasis).toBe("transaction");
    const { filter: listFilter } = transactionsFilterFromSearchParams(
      new URLSearchParams("dateFrom=2026-10-01&dateTo=2026-10-31&dateBasis=transaction"),
    );
    expect(listFilter.dateBasis).toBe("transaction");
  });

  it("month navigation keeps the chosen basis and defaults to charge", () => {
    const base = { dateFrom: "2026-10-01", dateTo: "2026-10-31" };
    expect(shiftMonth({ ...base, dateBasis: "transaction" }, 1)).toMatchObject({
      dateBasis: "transaction",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-30",
    });
    expect(shiftMonth({ ...base } as never, -1)).toMatchObject({
      dateBasis: "charge",
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
    });
  });
});
