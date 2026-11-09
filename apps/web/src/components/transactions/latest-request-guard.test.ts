import { describe, expect, it } from "vitest";
import { createLatestRequestGuard } from "./latest-request-guard";

describe("createLatestRequestGuard", () => {
  it("accepts the only request", () => {
    const guard = createLatestRequestGuard();
    expect(guard.begin()()).toBe(true);
  });

  it("rejects an older request once a newer one starts", () => {
    const guard = createLatestRequestGuard();
    const first = guard.begin();
    const second = guard.begin();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });
});
