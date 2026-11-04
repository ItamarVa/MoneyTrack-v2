import { describe, expect, it } from "vitest";
import { detectEmbedded } from "./use-embedded";

describe("detectEmbedded", () => {
  it("is false when the window is its own top", () => {
    const win = {} as Window;
    Object.assign(win, { self: win, top: win });
    expect(detectEmbedded(win)).toBe(false);
  });

  it("is true when top is a different window", () => {
    const win = {} as Window;
    Object.assign(win, { self: win, top: {} });
    expect(detectEmbedded(win)).toBe(true);
  });

  it("is true when reading top throws (cross-origin parent)", () => {
    const win = {
      self: {},
      get top(): never {
        throw new DOMException("blocked", "SecurityError");
      },
    } as unknown as Window;
    expect(detectEmbedded(win)).toBe(true);
  });
});
