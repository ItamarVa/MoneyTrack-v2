import { describe, expect, it } from "vitest";
import { aggregateTopFive, breakdownTotal, OTHER_SLICE_NAME, toDonutSlices } from "./breakdown-utils";
import { CHART_COLORS } from "@/lib/chart-colors";

describe("aggregateTopFive", () => {
  it("keeps six or fewer slices unchanged", () => {
    const items = Array.from({ length: 6 }, (_, index) => ({
      categoryId: `00000000-0000-4000-8000-00000000000${index}`,
      categoryName: `Cat ${index}`,
      amountIls: -(index + 1) * 100,
      transactionCount: 1,
      drillDown: { filter: { dateBasis: "transaction" as const }, sourceView: "test" },
    }));

    expect(aggregateTopFive(items)).toHaveLength(6);
  });

  it("aggregates overflow into other", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      categoryId: `00000000-0000-4000-8000-00000000000${index}`,
      categoryName: `Cat ${index}`,
      amountIls: -(index + 1) * 100,
      transactionCount: index + 1,
      drillDown: { filter: { dateBasis: "transaction" as const }, sourceView: "test" },
    }));

    const result = aggregateTopFive(items);
    expect(result).toHaveLength(6);
    expect(result[5]?.categoryName).toBe(OTHER_SLICE_NAME);
    expect(Math.abs(result[5]!.amountIls)).toBe(300 + 200 + 100);
    expect(result[5]?.transactionCount).toBe(3 + 2 + 1);
    expect((result[5] as { memberIds?: string[] }).memberIds).toEqual([
      "00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000000",
    ]);
  });
});

describe("breakdownTotal", () => {
  it("sums signed expense contributions", () => {
    const total = breakdownTotal([
      {
        categoryId: null,
        categoryName: "A",
        amountIls: 100,
        transactionCount: 1,
        drillDown: { filter: { dateBasis: "transaction" }, sourceView: "test" },
      },
      {
        categoryId: null,
        categoryName: "B",
        amountIls: 250,
        transactionCount: 2,
        drillDown: { filter: { dateBasis: "transaction" }, sourceView: "test" },
      },
    ]);
    expect(total).toBe(350);
  });

  it("matches aggregateTopFive after refunds in the overflow bucket", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      categoryId: `00000000-0000-4000-8000-00000000000${index}`,
      categoryName: `Cat ${index}`,
      amountIls: (index + 1) * 100,
      transactionCount: 1,
      drillDown: { filter: { dateBasis: "transaction" as const }, sourceView: "test" },
    }));
    items[7]!.amountIls = -100;

    const aggregated = aggregateTopFive(items);
    expect(breakdownTotal(items)).toBe(breakdownTotal(aggregated));
  });
});

describe("toDonutSlices", () => {
  const drillDown = { filter: { dateBasis: "transaction" as const }, sourceView: "test" };

  it("keeps income colours stable when amounts reorder", () => {
    const salaryA = {
      categoryId: "00000000-0000-4000-8000-000000000001",
      categoryName: "Salary A",
      amountIls: 10000,
      transactionCount: 1,
      drillDown,
    };
    const salaryB = {
      categoryId: "00000000-0000-4000-8000-000000000002",
      categoryName: "Salary B",
      amountIls: 20000,
      transactionCount: 1,
      drillDown,
    };

    const highFirst = toDonutSlices([salaryB, salaryA], "income");
    const lowFirst = toDonutSlices([salaryA, salaryB], "income");

    const colorAHighFirst = highFirst.find((slice) => slice.categoryId === salaryA.categoryId)?.color;
    const colorALowFirst = lowFirst.find((slice) => slice.categoryId === salaryA.categoryId)?.color;
    const colorBHighFirst = highFirst.find((slice) => slice.categoryId === salaryB.categoryId)?.color;
    const colorBLowFirst = lowFirst.find((slice) => slice.categoryId === salaryB.categoryId)?.color;

    expect(colorAHighFirst).toBeDefined();
    expect(colorALowFirst).toBe(colorAHighFirst);
    expect(colorBHighFirst).toBe(colorBLowFirst);
    expect(colorAHighFirst).not.toBe(colorBHighFirst);
  });

  it("keeps expense colours index-based when amounts reorder", () => {
    const catA = {
      categoryId: "00000000-0000-4000-8000-000000000011",
      categoryName: "Food",
      amountIls: -5000,
      transactionCount: 3,
      drillDown,
    };
    const catB = {
      categoryId: "00000000-0000-4000-8000-000000000012",
      categoryName: "Rent",
      amountIls: -10000,
      transactionCount: 1,
      drillDown,
    };

    const highFirst = toDonutSlices([catB, catA], "expense");
    const lowFirst = toDonutSlices([catA, catB], "expense");

    expect(highFirst.find((slice) => slice.categoryName === "Rent")?.color).toBe(CHART_COLORS[0]);
    expect(highFirst.find((slice) => slice.categoryName === "Food")?.color).toBe(CHART_COLORS[1]);
    expect(lowFirst.find((slice) => slice.categoryName === "Food")?.color).toBe(CHART_COLORS[0]);
    expect(lowFirst.find((slice) => slice.categoryName === "Rent")?.color).toBe(CHART_COLORS[1]);
  });
});
