/**
 * Recognises the bank row that pays a credit-card issuer, and which issuer it is.
 * Every pattern below was taken from real Discount statement wording — the older
 * guesses ("חיוב כרטיס", "max card") matched nothing, so card spend was counted
 * twice: once on the bank and again on the scraped card (MEM-DOMAIN).
 * `processCardSettlements` in the engine decides which of these to exclude.
 */

/** Issuer code matches `accounts.institution_code` for a connected card. */
export type CardIssuer = "max" | "isracard" | "visacal" | "amex" | "leumicard" | "diners";

const ISSUER_PATTERNS: { issuer: CardIssuer; pattern: RegExp }[] = [
  { issuer: "max", pattern: /מקס\s*איט|לכרטיס\s+ממקס|max\s*it/i },
  { issuer: "isracard", pattern: /ישראכרט|לכרטיס\s+מישראכרט|isracard/i },
  // Never a bare "כאל": that also sits inside the name מיכאל.
  { issuer: "visacal", pattern: /כ\.\s*א\.\s*ל|לכרטיס\s+מכאל|ויזה\s+כאל|visa\s*cal/i },
  { issuer: "amex", pattern: /אמריקן\s*אקספרס|אמקס|american\s*express/i },
  { issuer: "leumicard", pattern: /לאומי\s*קארד|leumi\s*card/i },
  { issuer: "diners", pattern: /דיינרס|diners/i },
];

/**
 * Only a debit on a bank account can be a settlement. The caller must not feed
 * card rows in, or a purchase at a shop called "מקס" would be misread.
 */
export function resolveCardIssuer(description: string): CardIssuer | null {
  return ISSUER_PATTERNS.find(({ pattern }) => pattern.test(description))?.issuer ?? null;
}

export function looksLikeCardSettlement(description: string): boolean {
  return resolveCardIssuer(description) !== null;
}
