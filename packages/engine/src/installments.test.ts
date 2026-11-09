import { describe, expect, it } from "vitest";
import { shiftMonths } from "./dates.js";
import { reverseInstallmentDateShift } from "./installments.js";

describe("reverseInstallmentDateShift", () => {
  it("lands a month-end slice in the purchase month instead of overflowing", () => {
    // Stored slice-1 date 2026-02-28 (a purchase at local midnight on Mar 1,
    // sliced in UTC); the scraper reports slice 2 on Mar 31.
    expect(reverseInstallmentDateShift("2026-03-31", 2)).toBe("2026-02-28");
    expect(reverseInstallmentDateShift("2026-05-31", 4)).toBe("2026-02-28");
  });

  it("recovers a 31st purchase date from a clamped forward shift", () => {
    const purchase = "2026-01-31";
    for (let index = 1; index <= 12; index += 1) {
      const scraperDate = shiftMonths(purchase, index - 1);
      expect(reverseInstallmentDateShift(scraperDate, index).slice(0, 7)).toBe("2026-01");
    }
    expect(reverseInstallmentDateShift(shiftMonths(purchase, 2), 3)).toBe("2026-01-31");
  });

  it("leaves the first slice untouched", () => {
    expect(reverseInstallmentDateShift("2026-01-31", 1)).toBe("2026-01-31");
  });
});
