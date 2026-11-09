import { describe, expect, it } from "vitest";
import {
  STATEMENT_MAX_BYTES,
  checkStatementFile,
  findInvalidStatementFiles,
  sortStatementFiles,
  summarizeStatementUploads,
  supportsStatementUpload,
} from "@/components/accounts/statement-upload";

describe("checkStatementFile", () => {
  it("accepts a small xlsx, case-insensitive", () => {
    expect(checkStatementFile({ name: "a.xlsx", size: 100 })).toBe("ok");
    expect(checkStatementFile({ name: "A.XLSX", size: 100 })).toBe("ok");
  });

  it("rejects other extensions", () => {
    expect(checkStatementFile({ name: "a.xls", size: 100 })).toBe("type");
    expect(checkStatementFile({ name: "a.csv", size: 100 })).toBe("type");
  });

  it("enforces the 2 MB limit inclusively", () => {
    expect(checkStatementFile({ name: "a.xlsx", size: STATEMENT_MAX_BYTES })).toBe("ok");
    expect(checkStatementFile({ name: "a.xlsx", size: STATEMENT_MAX_BYTES + 1 })).toBe("size");
  });
});

describe("supportsStatementUpload", () => {
  it("is true only for isracard and amex", () => {
    expect(supportsStatementUpload("isracard")).toBe(true);
    expect(supportsStatementUpload("amex")).toBe(true);
    expect(supportsStatementUpload("max")).toBe(false);
  });
});

describe("sortStatementFiles", () => {
  it("orders by lastModified ascending, ties by name, without mutating", () => {
    const input = [
      { name: "c.xlsx", lastModified: 3 },
      { name: "b.xlsx", lastModified: 1 },
      { name: "a.xlsx", lastModified: 1 },
    ];
    expect(sortStatementFiles(input).map((f) => f.name)).toEqual(["a.xlsx", "b.xlsx", "c.xlsx"]);
    expect(input[0]?.name).toBe("c.xlsx");
  });
});

describe("findInvalidStatementFiles", () => {
  it("lists every bad file with its reason", () => {
    expect(
      findInvalidStatementFiles([
        { name: "a.xlsx", size: 1 },
        { name: "b.csv", size: 1 },
        { name: "c.xlsx", size: STATEMENT_MAX_BYTES + 1 },
      ]),
    ).toEqual([
      { name: "b.csv", check: "type" },
      { name: "c.xlsx", check: "size" },
    ]);
  });
});

describe("summarizeStatementUploads", () => {
  it("totals ingested and collects failures", () => {
    expect(
      summarizeStatementUploads([
        { name: "a.xlsx", ingested: 4 },
        { name: "b.xlsx", error: "bad" },
        { name: "c.xlsx", ingested: 6 },
      ]),
    ).toEqual({ ingested: 10, failed: [{ name: "b.xlsx", error: "bad" }] });
  });
});
