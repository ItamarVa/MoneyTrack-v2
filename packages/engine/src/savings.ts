/**
 * Tells apart "money we spent" from "money we moved into savings".
 * Buying or selling a money-market fund, funding a provident/pension account or
 * drawing a mortgage are not household income or expense — counting them was
 * what made a single month read several times its real spend (owner decision
 * 2026-09-14, MEM-DOMAIN).
 * Matched rows become kind=transfer, which contributes 0 to both sides.
 * Bank rows only: a shop can legitimately be named "מיטב".
 */

const SAVINGS_PATTERNS: RegExp[] = [
  // Securities and money-market funds: buying or selling securities (ני"ע), money-market fund names.
  /(קניית|מכירת)\s+ני["״']?ע/,
  /קרן\s+כספית/,
  /כספית\s+(שקלית|ניהול)/,
  // Israeli provident, pension and investment houses.
  /אלטשולר/,
  /מיטב\s+כספית|מיטב\s+דש/,
  /קסם\s+אקטיב/,
  /הראל\s+כספית|הראל\s+ביטוח\s+ופיננ/,
  /איילון\s*\(/,
  /י\.ל\.כספית/,
  /מור\s+גמל/,
  /מגדל\s+חברה/,
  /הע\.\s*למגדל/,
  /איביאי|\bibi\b/i,
  // A drawn loan is a liability, not salary.
  /הלוואות\s+ב\./,
];

export function looksLikeSavingsMove(description: string): boolean {
  return SAVINGS_PATTERNS.some((pattern) => pattern.test(description));
}
