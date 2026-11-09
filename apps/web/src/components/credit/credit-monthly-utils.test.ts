import type { Category, TrendPoint } from "@moneytrack/contracts";
import { describe, expect, it } from "vitest";
import {
  buildMonthlyData,
  canPageForward,
  keepSelectedVisible,
  latestDataPeriod,
  monthOverMonthPct,
  OTHER_KEY,
  pageWindowEnd,
  periodFromChartClick,
  UNCATEGORIZED_KEY,
  windowEndingAt,
} from "./credit-monthly-utils";

const cat = (id: string, parentId: string | null, name: string): Category => ({
  id,
  parentId,
  name,
  sortOrder: 0,
  note: null,
  createdAt: "2026-01-01T00:00:00.000Z",
});
const point = (period: string, segs: [string | null, string, number][]): TrendPoint =>
  ({
    period,
    drillDown: {},
    segments: segs.map(([categoryId, categoryName, amountIls]) => ({ categoryId, categoryName, amountIls, drillDown: {} })),
  }) as unknown as TrendPoint;

const monthWindow = (end: string) => windowEndingAt(end);

describe("windowEndingAt", () => {
  it("covers 12 months ending at the given month", () => {
    const w = windowEndingAt("2026-06");
    expect(w.months).toHaveLength(12);
    expect(w.months[0]).toBe("2025-07");
    expect(w.months[11]).toBe("2026-06");
    expect(w.dateFrom).toBe("2025-07-01");
    expect(w.dateTo).toBe("2026-06-30");
  });
  it("crosses the year boundary in January and December", () => {
    expect(windowEndingAt("2026-01").months[0]).toBe("2025-02");
    expect(windowEndingAt("2026-01").dateTo).toBe("2026-01-31");
    expect(windowEndingAt("2026-12").months[0]).toBe("2026-01");
    expect(windowEndingAt("2026-02").dateTo).toBe("2026-02-28");
  });
});

describe("latestDataPeriod", () => {
  it("returns the last period with data, ignoring empty and zero periods", () => {
    const points = [point("2026-03", [[null, "A", 5]]), point("2026-05", [[null, "A", 9]]), point("2026-06", []), point("2026-07", [[null, "A", 0]])];
    expect(latestDataPeriod(points)).toBe("2026-05");
  });
  it("is null when there is no data", () => expect(latestDataPeriod([point("2026-06", [])])).toBeNull());
});

describe("window paging", () => {
  it("pages a full year back and forward across year boundaries", () => {
    expect(pageWindowEnd("2026-01", -1)).toBe("2025-01");
    expect(pageWindowEnd("2025-12", 1)).toBe("2026-12");
  });
  it("disables forward once the window contains the latest data month", () => {
    expect(canPageForward("2026-05", "2026-05")).toBe(false);
    expect(canPageForward("2026-04", "2026-05")).toBe(true);
    expect(canPageForward("2025-05", "2026-05")).toBe(true);
    expect(canPageForward("2026-05", null)).toBe(false);
  });
});

describe("keepSelectedVisible", () => {
  it("does not move the window when the selection is inside", () => {
    expect(keepSelectedVisible("2026-06", "2025-07")).toBe("2026-06");
    expect(keepSelectedVisible("2026-06", "2026-06")).toBe("2026-06");
    expect(keepSelectedVisible("2026-06", "2026-01")).toBe("2026-06");
  });
  it("pages minimally when the selection is after the window", () => {
    expect(keepSelectedVisible("2026-06", "2026-07")).toBe("2026-07");
    expect(keepSelectedVisible("2025-12", "2026-01")).toBe("2026-01");
  });
  it("pages minimally when the selection is before the window", () => {
    expect(keepSelectedVisible("2026-06", "2025-06")).toBe("2026-05");
    expect(windowEndingAt(keepSelectedVisible("2026-06", "2025-06")).months[0]).toBe("2025-06");
    expect(keepSelectedVisible("2026-01", "2025-01")).toBe("2025-12");
  });
});

describe("buildMonthlyData", () => {
  const months = monthWindow("2026-03").months;
  const cats = [cat("p1", null, "Food"), cat("c1", "p1", "Groceries"), cat("c2", "p1", "Cafes"), cat("p2", null, "Car")];

  it("rolls leaves up to the top-level parent", () => {
    const data = buildMonthlyData([point("2026-03", [["c1", "Groceries", 100], ["c2", "Cafes", 50], ["p2", "Car", 30]])], cats, months);
    const row = data.rows.find((r) => r.period === "2026-03")!;
    expect(row.values.p1).toBe(150);
    expect(row.values.p2).toBe(30);
    expect(row.total).toBe(180);
    expect(data.series.map((s) => s.name)).toEqual(["Food", "Car"]);
  });

  it("keeps the top 5 by window total, rest to other, stable order", () => {
    const many = Array.from({ length: 7 }, (_, i) => cat(`t${i}`, null, `T${i}`));
    const segs = many.map((c, i): [string, string, number] => [c.id, c.name, (i + 1) * 10]);
    const data = buildMonthlyData([point("2026-03", segs), point("2026-02", [["t0", "T0", 5]])], many, months);
    expect(data.series.map((s) => s.key)).toEqual(["t6", "t5", "t4", "t3", "t2", OTHER_KEY]);
    expect(data.rows.find((r) => r.period === "2026-03")!.values[OTHER_KEY]).toBe(30);
    expect(data.rows.find((r) => r.period === "2026-02")!.values[OTHER_KEY]).toBe(5);
  });

  it("fills empty months and handles uncategorized", () => {
    const data = buildMonthlyData([point("2026-03", [[null, "Uncat", 40]])], cats, months);
    expect(data.rows).toHaveLength(12);
    expect(data.rows.filter((r) => r.total === 0)).toHaveLength(11);
    expect(data.series[0]).toMatchObject({ key: UNCATEGORIZED_KEY, name: "Uncat" });
    expect(data.series.some((s) => s.isOther)).toBe(false);
  });
});

describe("monthOverMonthPct", () => {
  it("computes percent change", () => expect(monthOverMonthPct(150, 100)).toBe(50));
  it("returns null without a positive previous", () => {
    expect(monthOverMonthPct(50, 0)).toBeNull();
    expect(monthOverMonthPct(50, undefined)).toBeNull();
  });
});

describe("buildMonthlyData without roll-up", () => {
  const months = monthWindow("2026-03").months;
  it("keeps segment ids and names as-is, even when ids match categories", () => {
    const cats = [cat("p1", null, "Food"), cat("c1", "p1", "Groceries")];
    const data = buildMonthlyData(
      [point("2026-03", [["c1", "Alice", 100], ["x2", "Bob", 40], [null, "General", 10]])],
      cats,
      months,
      false,
    );
    const row = data.rows.find((r) => r.period === "2026-03")!;
    expect(row.values.c1).toBe(100);
    expect(row.values.p1).toBeUndefined();
    expect(row.values.x2).toBe(40);
    expect(row.values[UNCATEGORIZED_KEY]).toBe(10);
    expect(data.series.find((s) => s.key === "c1")?.name).toBe("Alice");
    expect(row.total).toBe(150);
  });
});

describe("periodFromChartClick", () => {
  const months = monthWindow("2026-05").months;
  it("maps the active index", () => {
    expect(periodFromChartClick(months, { activeTooltipIndex: 11 })).toBe("2026-05");
    expect(periodFromChartClick(months, { activeTooltipIndex: "0" })).toBe("2025-06");
  });
  it("falls back to the label", () => {
    expect(periodFromChartClick(months, { activeLabel: "2026-01" })).toBe("2026-01");
  });
  it("returns null when nothing maps", () => {
    expect(periodFromChartClick(months, { activeTooltipIndex: 99, activeLabel: "x" })).toBeNull();
    expect(periodFromChartClick(months, null)).toBeNull();
    expect(periodFromChartClick(months, {})).toBeNull();
  });
});
