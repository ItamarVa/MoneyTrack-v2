/**
 * Card under a donut that says what the selected slice is (name, amount, percent) and
 * holds the explicit drill button. Why: touch has no hover tooltip, so selection must be readable.
 * The aria-live wrapper is always mounted so screen readers announce content changes.
 * Used by: dual-ring-donut.tsx, drill-down-donut.tsx.
 */
import { formatIls } from "@/lib/currency";
import he from "@/locales/he.json";
import { formatPercent } from "./breakdown-utils";
import type { DonutSlice } from "./types";

type DonutSelectionReadoutProps = {
  slice: DonutSlice | null;
  /** Suffix after the percent, e.g. "מההוצאות". */
  percentSuffix: string;
  /** Percent the caller wants shown (defaults to slice.percent). */
  percent?: number;
  /** Extra line (transaction count, owner, …). */
  detail?: string | null;
  /** Button text, or null when this slice cannot drill. */
  drillLabel: string | null;
  onDrill: (slice: DonutSlice) => void;
  onClear: () => void;
};

export function DonutSelectionReadout({
  slice,
  percentSuffix,
  percent,
  detail,
  drillLabel,
  onDrill,
  onClear,
}: DonutSelectionReadoutProps) {
  return (
    <div aria-live="polite" role="region" aria-label={he.donutSelect.readoutLabel} className="mt-3">
      {slice ? (
        <div
          dir="rtl"
          className="rounded-lg border border-border-strong bg-surface-elevated p-3"
          style={{ borderInlineStartColor: slice.color, borderInlineStartWidth: 4 }}
        >
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 break-words text-base font-semibold text-text-primary">
              {slice.categoryName}
            </p>
            <button
              type="button"
              onClick={onClear}
              aria-label={he.donutSelect.clear}
              className="-mt-2 -me-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-xl text-text-secondary hover:bg-surface-card"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <p className="font-display text-2xl text-text-primary">
            <bdi dir="ltr">{formatIls(slice.displayAmount)}</bdi>
          </p>
          {slice.isBalanceHighlight ? (
            slice.explanation ? <p className="mt-1 text-sm text-text-secondary">{slice.explanation}</p> : null
          ) : (
            <p className="mt-1 text-sm text-text-secondary">
              {formatPercent(percent ?? slice.percent)} {percentSuffix}
            </p>
          )}
          {detail ? <p className="mt-0.5 text-xs text-text-muted">{detail}</p> : null}
          {drillLabel ? (
            <button
              type="button"
              onClick={() => onDrill(slice)}
              className="mt-3 min-h-11 w-full rounded-lg bg-brand-orange-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-orange-500"
            >
              {drillLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
