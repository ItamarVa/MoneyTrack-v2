import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_PERIOD,
  PERIOD_STORAGE_KEY,
  currentMonthPeriod,
  periodFromFilter,
  periodToFilter,
  readStoredPeriod,
  shiftGlobalPeriod,
  storePeriod,
} from "./period-context";

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

describe("period-context helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createLocalStorageMock());
    vi.stubGlobal("sessionStorage", createLocalStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to the current month when storage is empty", () => {
    expect(readStoredPeriod()).toBe(currentMonthPeriod());
  });

  it("ignores a stale month in localStorage when the session has no value", () => {
    localStorage.setItem(PERIOD_STORAGE_KEY, "2020-08");
    expect(readStoredPeriod()).toBe(currentMonthPeriod());
  });

  it("purges the legacy localStorage value on read", () => {
    localStorage.setItem(PERIOD_STORAGE_KEY, "2020-08");
    readStoredPeriod();
    expect(localStorage.getItem(PERIOD_STORAGE_KEY)).toBeNull();
  });

  it("round-trips a month through sessionStorage", () => {
    storePeriod("2025-08");
    expect(readStoredPeriod()).toBe("2025-08");
    expect(sessionStorage.getItem(PERIOD_STORAGE_KEY)).toBe("2025-08");
    expect(localStorage.getItem(PERIOD_STORAGE_KEY)).toBeNull();
  });

  it("round-trips all-period through sessionStorage", () => {
    storePeriod(ALL_PERIOD);
    expect(readStoredPeriod()).toBe(ALL_PERIOD);
  });

  it("maps a normal month to charge-basis bounds by default", () => {
    expect(periodToFilter("2025-08")).toEqual({
      dateBasis: "charge",
      dateFrom: "2025-08-01",
      dateTo: "2025-08-31",
    });
  });

  it("keeps an explicit transaction basis (bookmarked analysis URLs)", () => {
    expect(periodToFilter("2025-08", "transaction").dateBasis).toBe("transaction");
  });

  it("maps ALL_PERIOD to a filter without date bounds", () => {
    const filter = periodToFilter(ALL_PERIOD);
    expect(filter.dateBasis).toBe("charge");
    expect(filter.dateFrom).toBeUndefined();
    expect(filter.dateTo).toBeUndefined();
  });

  it("inverts month bounds back to YYYY-MM", () => {
    const period = periodFromFilter({
      dateBasis: "charge",
      dateFrom: "2025-08-01",
      dateTo: "2025-08-31",
    });
    expect(period).toBe("2025-08");
  });

  it("inverts an all-period filter", () => {
    expect(periodFromFilter({ dateBasis: "charge" })).toBe(ALL_PERIOD);
    expect(
      periodFromFilter(
        { dateBasis: "charge", dateFrom: "2025-08-01", dateTo: "2025-08-31" },
        true,
      ),
    ).toBe(ALL_PERIOD);
  });

  it("leaves ALL_PERIOD unchanged when shifting", () => {
    expect(shiftGlobalPeriod(ALL_PERIOD, -1)).toBe(ALL_PERIOD);
    expect(shiftGlobalPeriod(ALL_PERIOD, 1)).toBe(ALL_PERIOD);
  });

  it("shifts a month forward and back", () => {
    expect(shiftGlobalPeriod("2025-08", 1)).toBe("2025-09");
    expect(shiftGlobalPeriod("2025-08", -1)).toBe("2025-07");
  });
});
