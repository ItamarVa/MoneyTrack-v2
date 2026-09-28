import { describe, expect, it } from "vitest";
import {
  allowlistKey,
  buildNeedles,
  formatHit,
  maskValue,
  normalizeValue,
  parseAllowlist,
  scanText,
  sha256,
  wordPairs,
} from "./real-data-match.mjs";

// Every value below is synthetic.
describe("normalizeValue", () => {
  it("lowercases, collapses whitespace and trims", () => {
    expect(normalizeValue("  Acme   Widgets\tLTD \n")).toBe("acme widgets ltd");
  });
});

describe("buildNeedles", () => {
  it("drops short values and keeps the first kind for duplicates", () => {
    const { texts } = buildNeedles([
      { kind: "merchant", value: "Zorblax Outfitters" },
      { kind: "description", value: "zorblax  outfitters" },
      { kind: "person", value: "Abc" },
    ]);
    expect([...texts]).toEqual([["zorblax outfitters", "merchant"]]);
  });

  it("adds word pairs for descriptions only", () => {
    const { texts } = buildNeedles([
      { kind: "description", value: "payment quibble fernsworth tel" },
      { kind: "merchant", value: "grommet yard supply" },
    ]);
    expect(texts.get("quibble fernsworth")).toBe("description-phrase");
    expect(texts.has("yard supply")).toBe(false);
  });

  it("treats digit strings as numbers with separator parts, ignoring leading zeros", () => {
    const { numbers, texts } = buildNeedles([
      { kind: "account-number", value: "012-7654321" },
      { kind: "credential", value: 99887 },
    ]);
    expect([...numbers.keys()].sort()).toEqual(["127654321", "7654321"]);
    expect(texts.size).toBe(0);
  });

  it("skips allowlisted values by hash of the normalized form", () => {
    const allow = new Set([sha256("generic cafe chain"), sha256("7654321")]);
    const { texts, numbers } = buildNeedles(
      [
        { kind: "merchant", value: "Generic  CAFE chain" },
        { kind: "account-number", value: "7654321" },
      ],
      allow,
    );
    expect(texts.size).toBe(0);
    expect(numbers.size).toBe(0);
  });
});

describe("scanText", () => {
  const needles = buildNeedles([
    { kind: "description", value: "Quibble Fernsworth Kft" },
    { kind: "account-number", value: "98-7654321" },
  ]);

  it("reports file:line for substring and digit-run matches", () => {
    const text = [
      "const ok = 'nothing here';",
      "const row = { description: 'QUIBBLE   fernsworth kft 42' };",
      "const leadingZero = 'x 0987654321';",
      "const branchAcct = '98/7654321';",
    ].join("\r\n");
    const hits = scanText("fixture.ts", text, needles);
    expect(hits.map((hit) => [hit.line, hit.kind, hit.value])).toEqual([
      [2, "description", "quibble fernsworth kft"],
      [2, "description-phrase", "quibble fernsworth"],
      [2, "description-phrase", "fernsworth kft"],
      [3, "account-number", "987654321"],
      [4, "account-number", "987654321"],
      [4, "account-number", "7654321"],
    ]);
  });

  it("matches word pairs only on word boundaries, full values anywhere", () => {
    const pairs = buildNeedles([{ kind: "description", value: "shop a bit more" }]);
    expect(scanText("f.ts", "data bits here", pairs)).toEqual([]);
    expect(scanText("f.ts", "(a bit)", pairs).map((hit) => hit.value)).toEqual(["a bit"]);
    expect(scanText("f.ts", "xshop a bit morex", pairs).map((hit) => hit.value)).toEqual([
      "shop a bit more",
      "a bit",
    ]);
  });

  it("does not match numbers embedded in a longer digit run", () => {
    expect(scanText("f.ts", "id = 17654321999", needles)).toEqual([]);
  });

  it("is clean on unrelated text", () => {
    expect(scanText("f.ts", "synthetic merchant and 123", needles)).toEqual([]);
  });
});

describe("maskValue and formatHit", () => {
  it("keeps only the first and last two characters", () => {
    expect(maskValue("zorblax outfitters")).toBe("zo***rs");
    expect(maskValue("abcde")).toBe("***");
  });

  it("never prints the full value", () => {
    const line = formatHit({ path: "a.ts", line: 3, kind: "merchant", value: "zorblax outfitters" });
    expect(line).toBe("a.ts:3  merchant  zo***rs (len 18)");
    expect(line).not.toContain("zorblax");
  });
});

describe("allowlist", () => {
  it("parses hashes and comments", () => {
    const hash = sha256("x");
    const parsed = parseAllowlist(`# header\n${hash}  # generic brand\n\n`);
    expect([...parsed]).toEqual([hash]);
  });

  it("rejects plaintext entries", () => {
    expect(() => parseAllowlist("zorblax outfitters\n")).toThrow(/SHA-256/);
  });

  it("hashes numbers by digits and text by normalized form", () => {
    expect(allowlistKey(" 00123-456 ")).toBe("123456");
    expect(allowlistKey("Generic  Cafe")).toBe("generic cafe");
  });
});

describe("wordPairs", () => {
  it("returns consecutive pairs", () => {
    expect(wordPairs("a b c")).toEqual(["a b", "b c"]);
  });
});
