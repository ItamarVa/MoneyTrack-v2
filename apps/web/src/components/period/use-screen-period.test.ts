import { describe, expect, it } from "vitest";
import { seedPeriod } from "./use-screen-period";

describe("seedPeriod", () => {
  it("returns null when not hydrated", () => {
    expect(seedPeriod(false, false, "2026-08", "2026-09")).toBeNull();
  });

  it("returns null when already seeded", () => {
    expect(seedPeriod(true, true, "2026-08", "2026-09")).toBeNull();
  });

  it("returns null when URL period is absent", () => {
    expect(seedPeriod(true, false, null, "2026-09")).toBeNull();
  });

  it("returns null when URL period matches context", () => {
    expect(seedPeriod(true, false, "2026-09", "2026-09")).toBeNull();
  });

  it("returns URL period when it differs from context", () => {
    expect(seedPeriod(true, false, "2026-08", "2026-09")).toBe("2026-08");
  });
});
