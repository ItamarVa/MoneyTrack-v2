/**
 * Minimal, dependency-free .xlsx reader (node:zlib only) for untrusted uploads.
 * Why: Isracard statement import needs cell values, nothing else of the OOXML spec.
 * Invariants: size/entry caps bound zip bombs; XML is scanned with regexes and only the
 * 5 standard entities are decoded (no DTD/entity expansion). Used by isracard-xlsx.ts.
 */
import { inflateRawSync } from "node:zlib";

const MAX_TOTAL_BYTES = 10 * 1024 * 1024;
const MAX_ENTRIES = 200;

export type Cell = { col: string; value: string | number | null };
export type Row = Cell[];

/** Returns only the worksheet and sharedStrings parts; every other entry is ignored. */
export function readZipEntries(buf: Buffer): Map<string, Buffer> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (buf.length < 22 || eocd < 0) throw new Error("Not a valid .xlsx file (zip structure not found)");
  const count = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  if (count > MAX_ENTRIES) throw new Error("Zip has too many entries");
  const out = new Map<string, Buffer>();
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > buf.length || buf.readUInt32LE(pos) !== 0x02014b50) {
      throw new Error("Corrupt zip central directory");
    }
    const method = buf.readUInt16LE(pos + 10);
    const csize = buf.readUInt32LE(pos + 20);
    const usize = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const localOff = buf.readUInt32LE(pos + 42);
    const name = buf.toString("utf8", pos + 46, pos + 46 + nameLen);
    pos += 46 + nameLen + extraLen + commentLen;

    total += usize;
    if (total > MAX_TOTAL_BYTES) throw new Error("Zip uncompressed size exceeds the limit");
    if (!/^xl\/(worksheets\/[^/]+\.xml|sharedStrings\.xml)$/.test(name)) continue;
    if (localOff + 30 > buf.length || buf.readUInt32LE(localOff) !== 0x04034b50) {
      throw new Error("Corrupt zip local header");
    }
    const start = localOff + 30 + buf.readUInt16LE(localOff + 26) + buf.readUInt16LE(localOff + 28);
    const raw = buf.subarray(start, start + csize);
    if (raw.length !== csize) throw new Error("Corrupt zip entry");
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) {
      try {
        data = inflateRawSync(raw, { maxOutputLength: MAX_TOTAL_BYTES });
      } catch {
        throw new Error("Corrupt or oversized zip entry");
      }
    } else throw new Error(`Unsupported zip compression method ${method}`);
    out.set(name, data);
  }
  return out;
}

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function textOf(xml: string): string {
  let s = "";
  for (const m of xml.matchAll(/<(?:[A-Za-z]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z]+:)?t>/g)) s += m[1] ?? "";
  return decode(s);
}

function sharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<(?:[A-Za-z]+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z]+:)?si>/g)].map((m) => textOf(m[1] ?? ""));
}

/** Rows of every worksheet, ordered by sheet number (ponytail: not workbook.xml order). */
export function readSheets(entries: Map<string, Buffer>): Row[][] {
  const names = [...entries.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((x, y) => parseInt(/(\d+)\.xml$/.exec(x)?.[1] ?? "0", 10) - parseInt(/(\d+)\.xml$/.exec(y)?.[1] ?? "0", 10));
  if (names.length === 0) throw new Error("Not a supported statement file (no xl/worksheets/sheetN.xml)");
  const sst = sharedStrings(entries.get("xl/sharedStrings.xml")?.toString("utf8"));
  return names.map((n) => readRows(entries.get(n)!.toString("utf8"), sst));
}

function readRows(xml: string, sst: string[]): Row[] {
  const data = /<(?:[A-Za-z]+:)?sheetData(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z]+:)?sheetData>/.exec(xml)?.[1] ?? "";
  const rows: Row[] = [];
  for (const rm of data.matchAll(/<(?:[A-Za-z]+:)?row(?:\s[^>]*?)?(?:\/>|>([\s\S]*?)<\/(?:[A-Za-z]+:)?row>)/g)) {
    const row: Row = [];
    for (const cm of (rm[1] ?? "").matchAll(/<(?:[A-Za-z]+:)?c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[A-Za-z]+:)?c>)/g)) {
      const attrs = cm[1] ?? "";
      const col = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      if (!col) continue;
      const type = /\bt="([^"]*)"/.exec(attrs)?.[1];
      const body = cm[2] ?? "";
      const v = /<(?:[A-Za-z]+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:[A-Za-z]+:)?v>/.exec(body)?.[1];
      let value: string | number | null = null;
      if (type === "inlineStr") value = textOf(body);
      else if (v === undefined) value = null;
      else if (type === "s") value = sst[Number(v)] ?? null;
      else if (type === "str") value = decode(v);
      else if (type === undefined || type === "n") value = Number.isFinite(Number(v)) ? Number(v) : null;
      else value = decode(v);
      row.push({ col, value });
    }
    rows.push(row);
  }
  return rows;
}
