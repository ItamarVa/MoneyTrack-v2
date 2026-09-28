/**
 * Merchant substring for categorization rules — first two normalized words,
 * or the whole string when shorter. Used by the drawer auto-rule block.
 */

/** First two words of a normalized description, or the full string when shorter. */
export function suggestMerchantPattern(descriptionNormalized: string): string {
  const trimmed = descriptionNormalized.trim();
  if (!trimmed) {
    return "";
  }
  const words = trimmed.split(/\s+/);
  if (words.length <= 2) {
    return trimmed;
  }
  return words.slice(0, 2).join(" ");
}
