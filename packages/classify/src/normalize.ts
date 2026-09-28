import { NORMALIZATION_VERSION } from "./constants.js";

const BRANCH_SUFFIX = /\s+סניף\s+\d+/gi;
const TERMINAL_SUFFIX = /\s+מסוף\s+\d+/gi;
const TRAILING_REF = /\s+\d{4,}$/;
const CITY_SUFFIX =
  /\s+(ת["״']?א|תל אביב|ירושלים|חיפה|באר שבע|ראשון לציון|פתח תקווה|הרצליה|נתניה|חולון)$/i;
const WHITESPACE = /\s+/g;
const QUOTES = /["״'']/g;
const PARENS_CODE = /\s*\([^)]*\)\s*$/;
const HASH_SUFFIX = /\s+#\d+$/;

const TRANSLITERATION: Record<string, string> = {
  wolt: "וולט",
  "wolt delivery": "וולט",
  super: "סופר",
  "super pharm": "סופר פארם",
  "super-pharm": "סופר פארם",
  mcdonalds: "מקדונלדס",
  "mcdonald's": "מקדונלדס",
  amazon: "אמזון",
  paypal: "פייפאל",
  netflix: "נטפליקס",
};

/** Strip branch numbers, terminal IDs, trailing codes, and Hebrew/Latin variants. */
export function normalizeMerchant(raw: string): string {
  let value = raw.replace(/\0/g, "").trim().toLowerCase();
  value = value.replace(BRANCH_SUFFIX, "");
  value = value.replace(TERMINAL_SUFFIX, "");
  value = value.replace(PARENS_CODE, "");
  value = value.replace(HASH_SUFFIX, "");
  value = value.replace(TRAILING_REF, "");
  value = value.replace(CITY_SUFFIX, "");
  value = value.replace(QUOTES, "");
  value = value.replace(WHITESPACE, " ").trim();

  const transliterationEntries = Object.entries(TRANSLITERATION).sort(
    ([a], [b]) => b.length - a.length,
  );
  for (const [latin, hebrew] of transliterationEntries) {
    if (value.includes(latin)) {
      value = value.replaceAll(latin, hebrew);
    }
  }

  return value;
}

export function getNormalizationVersion(): number {
  return NORMALIZATION_VERSION;
}
