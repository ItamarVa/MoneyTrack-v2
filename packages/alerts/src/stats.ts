export function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

export function mad(values: number[], med = median(values)): number {
  if (values.length === 0) {
    return 0;
  }
  const deviations = values.map((v) => Math.abs(v - med));
  return median(deviations);
}

export function amountsClose(a: number, b: number, tolerance = 0.05): boolean {
  if (a === 0 && b === 0) {
    return true;
  }
  const base = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / base <= tolerance;
}
