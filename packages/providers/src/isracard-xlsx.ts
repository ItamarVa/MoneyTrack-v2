/**
 * Parses the Isracard website "transaction details" .xlsx export into the same account shape
 * the israeli-bank-scrapers Isracard scraper returns (TransactionsAccount), so it can go
 * through the normal ingest pipeline. Mirrors base-isracard-amex.js convertTransactions:
 * accountNumber = card last 4, charges negative, identifier = parseInt(voucher).
 * Dates are local-midnight ISO strings, same as the scraper (moment(...).toISOString()), so
 * map-transaction's slice(0,10) yields the same date, and identity hash, as a later scraper sync. Input is an untrusted upload; see xlsx-reader.ts for limits.
 */
import type { Transaction, TransactionsAccount } from "israeli-bank-scrapers/lib/transactions.js";
import { readSheets, readZipEntries } from "./xlsx-reader.js";

/** chargeMonth "YYYY-MM": one entry per (card, chargeMonth) so the caller reconciles per month. */
export type ScraperLikeAccount = TransactionsAccount & { chargeMonth: string };
export type ScraperLikeTransaction = Transaction;

const CURRENCIES: Record<string, string> = {
  "₪": "ILS",
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  Ft: "HUF",
  "zł": "PLN",
  "Kč": "CZK",
  "¥": "JPY",
};
const HEB_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const HEADERS = {
  date: "תאריך רכישה",
  merchant: "שם בית עסק",
  original: "סכום עסקה",
  originalCur: "מטבע עסקה",
  charged: "סכום חיוב",
  chargedCur: "מטבע חיוב",
  voucher: "מס' שובר",
  more: "פירוט נוסף",
} as const;
type HeaderKey = keyof typeof HEADERS;

// Zero-width, bidi marks and isolates (ranges built from code points to keep the source ASCII-safe).
const INVISIBLE = new RegExp(`[${[[0x200b, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069], [0xfeff, 0xfeff]].map(([a, b]) => String.fromCharCode(a!) + "-" + String.fromCharCode(b!)).join("")}]`, "g");

const clean = (v: string | number | null): string =>
  v === null ? "" : String(v).replace(INVISIBLE, "").trim();

function iso(y: number, m: number, d: number): string {
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    throw new Error(`Invalid date ${d}.${m}.${y}`);
  }
  // Local midnight, exactly like the scraper (moment local parse): identity hashes must match its output.
  return dt.toISOString();
}

/**
 * The export shows the ORIGINAL purchase date on installment rows; the scraper's fixInstallments
 * shifts slice k forward by k-1 months (moment add: day clamped to month end). Match it.
 */
function purchaseDate(y: number, m: number, d: number, k: number): string {
  iso(y, m, d);
  if (k <= 1) return iso(y, m, d);
  const last = new Date(y, m - 1 + (k - 1) + 1, 0).getDate();
  const dt = new Date(y, m - 1 + (k - 1), Math.min(d, last));
  return dt.toISOString();
}

function toNumber(v: string | number | null, what: string): number {
  const n = typeof v === "number" ? v : Number(clean(v).replace(/[₪$€£,\s]/g, ""));
  if (v === null || !Number.isFinite(n)) throw new Error(`Invalid ${what} amount: ${clean(v)}`);
  return n;
}

function currencyCode(symbol: string): string {
  if (/^[A-Z]{3}$/.test(symbol)) return symbol;
  const code = CURRENCIES[symbol];
  if (!code) throw new Error(`Unknown currency symbol: ${symbol}`);
  return code;
}

/** Year of a month-title cell like "<Hebrew month> 2026", else null. */
function titleYear(texts: string[]): number | null {
  for (const t of texts) {
    const y = /(\d{4})/.exec(t)?.[1];
    if (y && HEB_MONTHS.some((m) => t.includes(m))) return Number(y);
  }
  return null;
}

export function parseIsracardStatement(buf: Buffer): { accounts: ScraperLikeAccount[] } {
  const accounts = new Map<string, ScraperLikeAccount>();
  let sawHeader = false;
  for (const rows of readSheets(readZipEntries(buf))) {
  let year: number | null = null;
  let card: string | null = null;
  let processedDate: string | null = null;
  let chargeMonth = "";
  let cols: Record<HeaderKey, string> | null = null;

  for (const row of rows) {
    const texts = row.map((c) => clean(c.value));
    const find = (h: string) => row.find((c) => clean(c.value) === h)?.col;
    if (find(HEADERS.date) && find(HEADERS.merchant)) {
      // Not-yet-posted section ("עסקאות שטרם נקלטו"): no charged-amount column, rows are not final.
      if (!find(HEADERS.charged)) {
        cols = null;
        sawHeader = true;
        continue;
      }
      const map = {} as Record<HeaderKey, string>;
      for (const k of Object.keys(HEADERS) as HeaderKey[]) {
        const col = find(HEADERS[k]);
        if (!col && k !== "more") throw new Error(`Header column missing: ${HEADERS[k]}`);
        map[k] = col ?? "";
      }
      if (!card || !processedDate) throw new Error("Card number or charge date missing before table header");
      cols = map;
      sawHeader = true;
      continue;
    }
    if (cols && texts.some((t) => /סה.{0,2}כ לחיוב/.test(t))) {
      cols = null;
      continue;
    }
    if (!cols) {
      year = titleYear(texts) ?? year;
      const last4 = /-\s*(\d{4})$/.exec(texts[0] ?? "")?.[1];
      if (last4) {
        card = last4;
        processedDate = null;
      }
      const charge = texts.map((t) => /לחיוב ב-?\s*(\d{1,2})\.(\d{1,2})/.exec(t)).find(Boolean);
      if (charge) {
        if (year === null) throw new Error("Charge date found before any month title (e.g. month + year)");
        processedDate = iso(year, Number(charge[2]), Number(charge[1]));
        chargeMonth = `${year}-${charge[2]!.padStart(2, "0")}`;
      }
      continue;
    }
    const c = cols;
    const get = (k: HeaderKey) => row.find((x) => x.col === c[k])?.value ?? null;
    const dm = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(clean(get("date")));
    if (!dm) {
      if (get("original") !== null && get("charged") !== null) {
        throw new Error(`Invalid purchase date: ${clean(get("date"))}`);
      }
      continue;
    }
    const memoLines = clean(get("more"))
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const inst = /תשלום\s+(\d+)\s+מתוך\s+(\d+)/.exec(memoLines.join(" "));
    const identifier = parseInt(clean(get("voucher")), 10);
    const txn: Transaction = {
      type: (inst ? "installments" : "normal") as Transaction["type"],
      ...(Number.isNaN(identifier) ? {} : { identifier }),
      date: purchaseDate(2000 + Number(dm[3]), Number(dm[2]), Number(dm[1]), inst ? Number(inst[1]) : 1),
      processedDate: processedDate!,
      originalAmount: -toNumber(get("original"), "original"),
      originalCurrency: currencyCode(clean(get("originalCur"))),
      chargedAmount: -toNumber(get("charged"), "charged"),
      chargedCurrency: currencyCode(clean(get("chargedCur")) || "₪"),
      description: clean(get("merchant")),
      memo: memoLines.join("; "),
      installments: inst ? { number: Number(inst[1]), total: Number(inst[2]) } : undefined,
      status: "completed" as Transaction["status"],
    };
    const key = `${card}|${chargeMonth}`;
    const acc = accounts.get(key) ?? { accountNumber: card!, chargeMonth, txns: [] };
    acc.txns.push(txn);
    accounts.set(key, acc);
  }
  }
  if (!sawHeader) throw new Error("Transactions table header not found in file");
  return { accounts: [...accounts.values()] };
}
