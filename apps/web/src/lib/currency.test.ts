import { describe, expect, it } from "vitest";

import { formatIls, formatIlsExact } from "./currency";

describe("formatIls", () => {
  it("rounds to whole shekels with no fraction digits", () => {
    expect(formatIls(120)).toBe("120 ₪");
    expect(formatIls(120.4)).toBe("120 ₪");
    expect(formatIls(120.5)).toBe("121 ₪");
    expect(formatIls(120.75)).toBe("121 ₪");
  });

  it("uses Unicode minus sign for negatives", () => {
    expect(formatIls(-50)).toBe("\u221250 ₪");
    expect(formatIls(-50.75)).toBe("\u221251 ₪");
  });
});

describe("formatIlsExact", () => {
  it("always shows two decimal places", () => {
    expect(formatIlsExact(120)).toBe("120.00 ₪");
    expect(formatIlsExact(120.5)).toBe("120.50 ₪");
    expect(formatIlsExact(120.756)).toBe("120.76 ₪");
    expect(formatIlsExact(0)).toBe("0.00 ₪");
  });

  it("uses Unicode minus sign for negatives", () => {
    expect(formatIlsExact(-42.5)).toBe("\u221242.50 ₪");
  });
});
