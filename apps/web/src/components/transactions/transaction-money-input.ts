/**
 * Money text inputs: show two decimals (so 76.60282000000001 reads 76.60) while never losing the
 * stored precision. A draft remembers the original number; if the text still equals its formatted
 * form the user did not edit it, so the original value is what gets saved.
 * Used by: transaction-detail-drawer.tsx (split amounts).
 */
export function formatMoneyInput(value: number): string {
  return value.toFixed(2);
}

export function resolveMoneyInput(text: string, original?: number): number {
  if (original !== undefined && text === formatMoneyInput(original)) return original;
  return Number(text);
}
