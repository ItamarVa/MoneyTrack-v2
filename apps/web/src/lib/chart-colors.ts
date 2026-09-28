/**
 * Colourblind-safe categorical palette for charts (10 hues + brand accent reserved).
 * Verified for distinguishability in light and dark themes; orange stays brand-only.
 * Income slices use a separate vivid palette with stable key-based assignment.
 */
export const CHART_COLORS = [
  "#0072B2",
  "#E69F00",
  "#009E73",
  "#CC79A7",
  "#56B4E9",
  "#D55E00",
  "#F0E442",
  "#882255",
  "#332288",
  "#117733",
];

/**
 * High-saturation income palette — deliberately unlike muted Okabe-Ito expense hues.
 * Avoids brand orange, surplus/deficit green/red, and CHART_OTHER grey.
 */
export const INCOME_CHART_COLORS = [
  "#FF2D95",
  "#9B5CFF",
  "#00E5A0",
  "#FFB800",
  "#FF5C33",
  "#00D4FF",
  "#E040FB",
  "#C6FF00",
];

export const CHART_OTHER_COLOR = "#999999";

export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length]!;
}

/** FNV-1a hash — same key always maps to the same palette slot. */
export function stableColorIndex(key: string, length: number): number {
  if (length <= 0) {
    return 0;
  }
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
}

/**
 * Assign palette colours by stable identity. Collision resolution is keyed per item
 * (not by list order) so colours stay fixed when amount sort reorders slices.
 */
export function assignStableColors(keys: string[], palette: readonly string[]): Map<string, string> {
  const result = new Map<string, string>();
  if (palette.length === 0) {
    return result;
  }

  const uniqueKeys = [...new Set(keys)].sort();
  const usedIndices = new Set<number>();

  for (const key of uniqueKeys) {
    let assigned = false;
    for (let probe = 0; probe < palette.length; probe += 1) {
      const probeKey = probe === 0 ? key : `${key}\0${probe}`;
      const index = stableColorIndex(probeKey, palette.length);
      if (usedIndices.has(index)) {
        continue;
      }
      usedIndices.add(index);
      result.set(key, palette[index]!);
      assigned = true;
      break;
    }
    if (!assigned) {
      result.set(key, palette[stableColorIndex(key, palette.length)]!);
    }
  }
  return result;
}
