import { describe, expect, it } from "vitest";
import { budgetTone, budgetUsagePct } from "./budget-progress";

describe("budgetTone", () => {
  it("is neutral under 80, warning from 80 to 100, danger above 100", () => {
    expect(budgetTone(0)).toBe("neutral");
    expect(budgetTone(79.9)).toBe("neutral");
    expect(budgetTone(80)).toBe("warning");
    expect(budgetTone(100)).toBe("warning");
    expect(budgetTone(100.1)).toBe("danger");
  });
});

describe("budgetUsagePct", () => {
  it("returns the raw ratio and 0 for a non-positive budget", () => {
    expect(budgetUsagePct(450, 500)).toBe(90);
    expect(budgetUsagePct(750, 500)).toBe(150);
    expect(budgetUsagePct(100, 0)).toBe(0);
  });
});
