// Synthetic-data tests for parseIsracardStatement; xlsx files are built in memory.
import type { Transaction } from "israeli-bank-scrapers/lib/transactions.js";
import { describe, expect, it } from "vitest";
import { parseIsracardStatement } from "./isracard-xlsx.js";

function crc32(b: Buffer): number {
  let c = ~0;
  for (const x of b) {
    c ^= x;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let off = 0;
  for (const [name, text] of Object.entries(files)) {
    const n = Buffer.from(name);
    const d = Buffer.from(text);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0);
    l.writeUInt32LE(crc32(d), 14);
    l.writeUInt32LE(d.length, 18);
    l.writeUInt32LE(d.length, 22);
    l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt32LE(crc32(d), 16);
    c.writeUInt32LE(d.length, 20);
    c.writeUInt32LE(d.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(off, 42);
    locals.push(l, n, d);
    central.push(c, n);
    off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(central);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(Object.keys(files).length, 8);
  e.writeUInt16LE(Object.keys(files).length, 10);
  e.writeUInt32LE(cd.length, 12);
  e.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, e]);
}

type V = string | number | null;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function xlsx(...sheets: V[][][]): Buffer {
  const sst: string[] = [];
  const files: Record<string, string> = {};
  sheets.forEach((rows, si) => {
    const sheetRows = rows.map((r, i) => {
      const cells = r
        .map((v, j) => {
          if (v === null) return "";
          const ref = `${"ABCDEFGH"[j]}${i + 1}`;
          if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
          // Mix shared strings, formula strings and inline strings like the real export.
          if (j === 5) return `<c r="${ref}" t="str"><f>x</f><v>${esc(v)}</v></c>`;
          if (j === 6) return `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
          sst.push(v);
          return `<c r="${ref}" t="s"><v>${sst.length - 1}</v></c>`;
        })
        .join("");
      return `<row r="${i + 1}">${cells}</row>`;
    });
    files[`xl/worksheets/sheet${si + 1}.xml`] = `<worksheet><sheetData>${sheetRows.join("")}</sheetData></worksheet>`;
  });
  return zip({
    "xl/sharedStrings.xml": `<sst>${sst.map((s) => `<si><t>${esc(s)}</t></si>`).join("")}</sst>`,
    ...files,
    "xl/media/image1.png": "not parsed",
  });
}

const HEADER = ["תאריך רכישה", "שם בית עסק", "סכום עסקה", "מטבע עסקה", "סכום חיוב", "מטבע חיוב", "מס' שובר", "פירוט נוסף"];
const TOTAL = [null, 'סה"כ לחיוב החודש בכרטיס בש"ח', null, null, 100];
const top = [["פירוט עסקאות"], [null, null, "נובמבר 2026"]];
function block(card: string, rows: V[][], charge = "02.12"): V[][] {
  return [
    [`Test Card - ${card}`, null, null, null, null, null, null, "₪ 100.00"],
    ["על שם Test Holder", null, null, null, null, null, null, `לחיוב ב-${charge}`],
    ["עסקאות למועד חיוב"],
    HEADER,
    ...rows,
    TOTAL,
    ["legal text"],
  ];
}

describe("parseIsracardStatement", () => {
  it("parses one card block", () => {
    const { accounts } = parseIsracardStatement(
      xlsx([...top, ...block("1234", [["05.11.26", "Shop A", 50.5, "₪", 50.5, "₪", "0012345", ""]])]),
    );
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.accountNumber).toBe("1234");
    expect(accounts[0]!.txns[0]!).toEqual({
      type: "normal",
      identifier: 12345,
      date: new Date(2026, 10, 5).toISOString(),
      processedDate: new Date(2026, 11, 2).toISOString(),
      originalAmount: -50.5,
      originalCurrency: "ILS",
      chargedAmount: -50.5,
      chargedCurrency: "ILS",
      description: "Shop A",
      memo: "",
      installments: undefined,
      status: "completed",
    });
  });

  it("parses two card blocks and strips RTL marks from the title", () => {
    const rows = [["05.11.26", "Shop A", 1, "₪", 1, "₪", "1", ""]];
    const { accounts } = parseIsracardStatement(
      xlsx([...top, ...block("‫1111‬", rows).map((r, i) => (i === 0 ? [`T ‫- 1111‬`, ...r.slice(1)] : r)), ...block("2222", rows)]),
    );
    expect(accounts.map((a) => a.accountNumber)).toEqual(["1111", "2222"]);
  });

  it("handles USD rows, memo text and refunds", () => {
    const { accounts } = parseIsracardStatement(
      xlsx([
        ...top,
        ...block("1234", [
          ["06.11.26", "Shop B", 10, "$", 36.2, "₪", "2", "אתר חו\"ל\nהוראת קבע"],
          ["07.11.26", "Shop C", -20, "₪", -20, "₪", "3", ""],
        ]),
      ]),
    );
    const [usd, refund] = accounts[0]!.txns as [Transaction, Transaction];
    expect(usd.originalCurrency).toBe("USD");
    expect(usd.chargedAmount).toBe(-36.2);
    expect(usd.memo).toBe("אתר חו\"ל; הוראת קבע");
    expect(refund.chargedAmount).toBe(20);
  });

  it("parses installments", () => {
    const { accounts } = parseIsracardStatement(
      xlsx([...top, ...block("1234", [["08.11.26", "Shop D", 90, "₪", 30, "₪", "4", "תשלום 7 מתוך 9"]])]),
    );
    expect(accounts[0]!.txns[0]!.type).toBe("installments");
    expect(accounts[0]!.txns[0]!.installments).toEqual({ number: 7, total: 9 });
  });

  it("reads several worksheets with different months", () => {
    const rows = [["05.11.26", "Shop A", 1, "₪", 1, "₪", "1", ""]];
    const dec = [[null, null, "דצמבר 2026"], ...block("1234", rows, "02.01")];
    const { accounts } = parseIsracardStatement(xlsx([...top, ...block("1234", rows)], dec));
    expect(accounts.map((a) => a.chargeMonth)).toEqual(["2026-12", "2026-01"]);
  });

  it("splits one sheet with two month sections for the same card", () => {
    const rows = [["05.11.26", "Shop A", 1, "₪", 1, "₪", "1", ""]];
    const { accounts } = parseIsracardStatement(
      xlsx([...top, ...block("1234", rows, "02.11"), [null, null, "דצמבר 2026"], ...block("1234", rows, "02.12")]),
    );
    expect(accounts.map((a) => [a.accountNumber, a.chargeMonth])).toEqual([
      ["1234", "2026-11"],
      ["1234", "2026-12"],
    ]);
    expect(accounts[1]!.txns[0]!.processedDate).toBe(new Date(2026, 11, 2).toISOString());
  });

  it("throws when no month title precedes the charge date", () => {
    expect(() => parseIsracardStatement(xlsx(block("1234", [])))).toThrow(/month title/);
  });

  it("maps forint, other symbols and 3-letter ISO codes", () => {
    const { accounts } = parseIsracardStatement(
      xlsx([
        ...top,
        ...block("1234", [
          ["05.11.26", "Shop A", 1000, "Ft", 10, "₪", "1", "בוצע בחו\"ל"],
          ["05.11.26", "Shop B", 5, "CHF", 20, "₪", "2", ""],
          ["05.11.26", "Shop C", 5, "zł", 5, "₪", "3", ""],
        ]),
      ]),
    );
    expect(accounts[0]!.txns.map((t) => t.originalCurrency)).toEqual(["HUF", "CHF", "PLN"]);
  });

  it("skips the not-yet-posted section and parses the posted one", () => {
    const rows = [["05.11.26", "Shop A", 7, "₪", 7, "₪", "9", ""]];
    const pending = [
      ["מסגרת:", null, null, null, null, null, null, "*החיוב אינו סופי"],
      ["עסקאות שטרם נקלטו"],
      ["תאריך רכישה", "שם בית עסק", "סכום עסקה", "מטבע עסקה"],
      ["06.11.26", "Pending Shop", 3, "₪"],
      [null, 'סה"כ עסקאות שטרם נקלטו', 3],
    ];
    const [head, holder, ...rest] = block("1234", rows, "02.12");
    const { accounts } = parseIsracardStatement(xlsx([...top, head!, holder!, ...pending, ...rest]));
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.txns).toHaveLength(1);
    expect(accounts[0]!.txns[0]!.description).toBe("Shop A");
    expect(accounts[0]!.txns[0]!.processedDate).toBe(new Date(2026, 11, 2).toISOString());
  });

  it("keeps the card and charge date across a second table with a section title in between", () => {
    const row = (d: string) => ["05.11.26", d, 1, "₪", 1, "₪", "1", ""];
    const [head, holder, title, header, ...rest] = block("1234", [row("Shop A")]);
    const { accounts } = parseIsracardStatement(
      xlsx([...top, head!, holder!, title!, header!, ...rest.slice(0, 2), ["עסקאות נוספות"], header!, row("Shop B"), TOTAL]),
    );
    expect(accounts[0]!.txns.map((t) => t.description)).toEqual(["Shop A", "Shop B"]);
  });

  it("shifts installment purchase dates like the scraper's fixInstallments", () => {
    const inst = (k: number, n: number) => ["תשלום", k, "מתוך", n].join(" "); // built at runtime to avoid real-memo phrases
    const row = (d: string, memo: string) => [d, "Shop", 1, "₪", 1, "₪", "1", memo];
    const { accounts } = parseIsracardStatement(
      xlsx([
        ...top,
        ...block("1234", [
          row("01.07.26", inst(1, 5)),
          row("01.07.26", inst(5, 5)),
          row("31.01.27", inst(2, 6)),
          row("31.01.28", inst(2, 6)),
          row("15.07.26", ""),
        ]),
      ]),
    );
    expect(accounts[0]!.txns.map((t) => t.date)).toEqual([
      new Date(2026, 6, 1).toISOString(),
      new Date(2026, 10, 1).toISOString(),
      new Date(2027, 1, 28).toISOString(),
      new Date(2028, 1, 29).toISOString(),
      new Date(2026, 6, 15).toISOString(),
    ]);
  });

  it("rejects an unknown currency symbol", () => {
    expect(() =>
      parseIsracardStatement(xlsx([...top, ...block("1234", [["08.11.26", "Shop", 1, "#", 1, "₪", "5", ""]])])),
    ).toThrow(/currency/);
  });

  it("rejects garbage and files without sheet1", () => {
    expect(() => parseIsracardStatement(Buffer.from("garbage"))).toThrow();
    expect(() => parseIsracardStatement(zip({ "a.txt": "x" }))).toThrow(/sheet/);
  });

  it("rejects a sheet without a header row", () => {
    expect(() => parseIsracardStatement(xlsx([...top, ["nothing here"]]))).toThrow(/header/);
  });

  it("reads a prefixed sheet without sharedStrings (str + inlineStr cells, empty rows)", () => {
    const str = (ref: string, v: string) => `<x:c r="${ref}" t="str" s="3"><x:v xml:space="preserve">${esc(v)}</x:v></x:c>`;
    const num = (ref: string, v: number) => `<x:c r="${ref}"><x:v>${v}</x:v></x:c>`;
    const inl = (ref: string, v: string) => `<x:c r="${ref}" t="inlineStr"><x:is><x:t>${esc(v)}</x:t></x:is></x:c>`;
    const row = (n: number, cells: string) => `<x:row r="${n}">${cells}</x:row>`;
    const sheet = [
      row(1, ""),
      `<x:row r="2" />`,
      row(3, str("C3", "נובמבר 2026")),
      row(4, str("A4", "Test Card - 4321") + `<x:c r="B4" t="str" />`),
      row(5, str("H5", "לחיוב ב-02.12")),
      row(6, ["תאריך רכישה", "שם בית עסק", "סכום עסקה", "מטבע עסקה", "סכום חיוב", "מטבע חיוב", "מס' שובר", "פירוט נוסף"].map((h, j) => str(`${"ABCDEFGH"[j]}6`, h)).join("")),
      row(7, str("A7", "05.11.26") + str("B7", "Shop A") + num("C7", 12.5) + str("D7", "₪") + num("E7", 12.5) + str("F7", "₪") + str("G7", "77") + inl("H7", `אתר חו"ל

הוראת קבע`)),
      row(8, str("B8", 'סה"כ לחיוב החודש בכרטיס בש"ח')),
    ].join(`
`);
    const buf = zip({ "xl/worksheets/sheet1.xml": `<?xml version="1.0"?><x:worksheet><x:sheetData>${sheet}</x:sheetData></x:worksheet>`, "xl/tables/table1.xml": "<t/>" });
    const { accounts } = parseIsracardStatement(buf);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]!.accountNumber).toBe("4321");
    expect(accounts[0]!.chargeMonth).toBe("2026-12");
    expect(accounts[0]!.txns[0]!.memo).toBe("אתר חו\"ל; הוראת קבע");
    expect(accounts[0]!.txns[0]!.chargedAmount).toBe(-12.5);
  });
});
