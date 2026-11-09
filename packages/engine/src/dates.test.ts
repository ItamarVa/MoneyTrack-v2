import { describe, expect, it } from "vitest";
import { shiftMonths } from "./dates.js";

describe("shiftMonths", () => {
  it("clamps the day to the target month instead of overflowing", () => {
    expect(shiftMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(shiftMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(shiftMonths("2026-08-31", 1)).toBe("2026-09-30");
    expect(shiftMonths("2026-01-30", 1)).toBe("2026-02-28");
  });

  it("crosses year boundaries both ways", () => {
    expect(shiftMonths("2026-12-31", 1)).toBe("2027-01-31");
    expect(shiftMonths("2026-01-15", -1)).toBe("2025-12-15");
    expect(shiftMonths("2026-01-31", 25)).toBe("2028-02-29");
  });

  it("handles negative shifts", () => {
    expect(shiftMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftMonths("2026-03-31", -6)).toBe("2025-09-30");
    expect(shiftMonths("2024-03-31", -13)).toBe("2023-02-28");
  });

  it("keeps the day when it fits and is identity for zero", () => {
    expect(shiftMonths("2026-05-15", 0)).toBe("2026-05-15");
    expect(shiftMonths("2026-02-28", 1)).toBe("2026-03-28");
  });
});
