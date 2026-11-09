/** Pure threshold tests for the price-increase and unusual-amount rules; synthetic data only. */
import { describe, expect, it } from "vitest";
import { evaluateAnomaly } from "./anomalies.js";
import type { DetectableTransaction } from "./eligible-transactions.js";
import { evaluatePriceIncrease } from "./subscriptions.js";

const ENTERTAINMENT_ID = "00000000-0000-4000-8000-000000000091";
const CLOTHING_ID = "00000000-0000-4000-8000-0000000000a1";
const GROCERY_ID = "00000000-0000-4000-8000-000000000011";
const EDUCATION_ID = "00000000-0000-4000-8000-000000000082";

const allowEntertainmentOnly = (id: string | null): boolean => id === null || id === ENTERTAINMENT_ID;

function series(
  amounts: number[],
  opts: { description?: string; categoryId?: string | null } = {},
): DetectableTransaction[] {
  return amounts.map((amount, index) => {
    const month = String(1 + index).padStart(2, "0");
    return {
      id: `t${index}`,
      transactionDate: `2025-${month}-05`,
      amountIls: amount,
      descriptionRaw: opts.description ?? "test",
      descriptionNormalized: opts.description ?? "test",
      categoryId: opts.categoryId ?? null,
    } as DetectableTransaction;
  });
}

describe("evaluatePriceIncrease", () => {
  it("flags a 20% rise after three stable monthly charges", () => {
    const rise = evaluatePriceIncrease(series([55.2, 55.2, 55.2, 66.24]), "Streaming Co", allowEntertainmentOnly);
    expect(rise?.priorAmount).toBeCloseTo(55.2);
    expect(rise?.newAmount).toBeCloseTo(66.24);
  });

  it("flags a rise on an entertainment-category series", () => {
    const rows = series([40, 40, 40, 60], { categoryId: ENTERTAINMENT_ID });
    expect(evaluatePriceIncrease(rows, "Streaming Co", allowEntertainmentOnly)).not.toBeNull();
  });

  it("needs a rise of at least 10 ILS even when it is over 10 percent", () => {
    expect(evaluatePriceIncrease(series([30, 30, 30, 36]), "Streaming Co", allowEntertainmentOnly)).toBeNull();
  });

  it("needs at least three stable charges before the rise", () => {
    expect(evaluatePriceIncrease(series([50, 50, 80]), "Streaming Co", allowEntertainmentOnly)).toBeNull();
    expect(evaluatePriceIncrease(series([90, 50, 50, 80]), "Streaming Co", allowEntertainmentOnly)).toBeNull();
  });

  it("rejects an irregular, high-variance series", () => {
    expect(evaluatePriceIncrease(series([100, 140, 90, 200]), "Shop Co", allowEntertainmentOnly)).toBeNull();
  });

  it("rejects a series that is not monthly", () => {
    const rows = series([50, 50, 50, 80]);
    rows[3]!.transactionDate = "2025-04-20";
    rows[2]!.transactionDate = "2025-03-27";
    rows[1]!.transactionDate = "2025-03-05";
    expect(evaluatePriceIncrease(rows, "Streaming Co", allowEntertainmentOnly)).toBeNull();
  });

  it("does not repeat the alert once the new price is stable", () => {
    expect(evaluatePriceIncrease(series([50, 50, 50, 80, 80]), "Streaming Co", allowEntertainmentOnly)).toBeNull();
  });

  it("rejects person-to-person wording", () => {
    const bit = series([50, 50, 50, 90], { description: "BIT transfer to a friend" });
    expect(evaluatePriceIncrease(bit, "Friend", allowEntertainmentOnly)).toBeNull();
    const bank = series([50, 50, 50, 90], { description: "העברה לחשבון" });
    expect(evaluatePriceIncrease(bank, "Friend", allowEntertainmentOnly)).toBeNull();
  });

  it("rejects community and residential fees by wording", () => {
    const rows = series([200, 200, 200, 260], { description: "ועד מקומי" });
    expect(evaluatePriceIncrease(rows, "Community Co", allowEntertainmentOnly)).toBeNull();
    expect(evaluatePriceIncrease(series([200, 200, 200, 260]), "קיבוץ דמו", allowEntertainmentOnly)).toBeNull();
  });

  it("rejects non-subscription categories", () => {
    for (const categoryId of [GROCERY_ID, CLOTHING_ID, EDUCATION_ID]) {
      const rows = series([100, 100, 100, 160], { categoryId });
      expect(evaluatePriceIncrease(rows, "Shop Co", allowEntertainmentOnly)).toBeNull();
    }
  });
});

describe("evaluateAnomaly", () => {
  it("ignores a small noisy grocery basket (75 vs usual ~71)", () => {
    expect(evaluateAnomaly([60, 70, 80, 71, 72, 69], 75)).toBeNull();
  });

  it("ignores a tripling that is under 100 ILS above usual", () => {
    expect(evaluateAnomaly([30, 30, 30, 30, 30], 90)).toBeNull();
  });

  it("flags a 3x purchase that is 100+ ILS above the median", () => {
    expect(evaluateAnomaly([100, 100, 100, 100], 300)).toEqual({ median: 100 });
  });

  it("needs four earlier purchases", () => {
    expect(evaluateAnomaly([100, 100, 100], 900)).toBeNull();
  });
});
