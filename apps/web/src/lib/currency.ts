/**
 * Format ILS without bidi marks — plan §9.5.
 * Uses Unicode MINUS SIGN (U+2212) for negatives.
 */
const wholeShekelFormatter = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const exactFormatter = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Whole shekels — charts, summaries, dashboards. */
export function formatIls(amount: number): string {
  const sign = amount < 0 ? "\u2212" : "";
  return `${sign}${wholeShekelFormatter.format(Math.abs(amount))} ₪`;
}

/** Always two decimal places — transaction rows and detail splits. */
export function formatIlsExact(amount: number): string {
  const sign = amount < 0 ? "\u2212" : "";
  return `${sign}${exactFormatter.format(Math.abs(amount))} ₪`;
}

const foreignFormatter = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const foreignExactFormatter = new Intl.NumberFormat("he-IL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Original-currency amount when ILS is not yet available (pending FX). */
export function formatForeignAmount(amount: number, currency: string): string {
  const sign = amount < 0 ? "\u2212" : "";
  return `${sign}${foreignFormatter.format(Math.abs(amount))} ${currency}`;
}

/** Original-currency amount with fixed two decimals — transaction row secondary line. */
export function formatForeignAmountExact(amount: number, currency: string): string {
  const sign = amount < 0 ? "\u2212" : "";
  return `${sign}${foreignExactFormatter.format(Math.abs(amount))} ${currency}`;
}

/** Compact ILS for chart bar labels — drops decimals above 1 000. */
export function formatIlsCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    const scaled = amount / 1_000_000;
    const sign = scaled < 0 ? "\u2212" : "";
    return `${sign}${wholeShekelFormatter.format(Math.abs(scaled))}M ₪`;
  }
  if (abs >= 1_000) {
    const scaled = amount / 1_000;
    const sign = scaled < 0 ? "\u2212" : "";
    return `${sign}${wholeShekelFormatter.format(Math.abs(scaled))}K ₪`;
  }
  return formatIls(amount);
}
