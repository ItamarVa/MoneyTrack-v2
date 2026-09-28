/**
 * Accessible legend rows beside the donut — keyboard/touch targets with direct labels.
 */
import { formatIls } from "@/lib/currency";
import { formatPercent } from "./breakdown-utils";
import type { DonutSlice } from "./types";

type DonutLegendProps = {
  slices: DonutSlice[];
  onSelect?: (slice: DonutSlice) => void;
  selectedId: string | null;
  dense?: boolean;
};

function sliceKey(slice: DonutSlice): string {
  if (slice.isBalanceHighlight) {
    return `balance-${slice.balanceKind ?? "highlight"}`;
  }
  return slice.categoryId ?? slice.categoryName;
}

function sortLegendSlices(slices: DonutSlice[]): DonutSlice[] {
  const highlights = slices.filter((slice) => slice.isBalanceHighlight);
  const categories = slices.filter((slice) => !slice.isBalanceHighlight);
  return [...highlights, ...categories];
}

function LegendRowContent({
  slice,
  dense,
}: {
  slice: DonutSlice;
  active: boolean;
  dense: boolean;
}) {
  if (dense) {
    return (
      <>
        <div className="flex items-center justify-between gap-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="inline-block size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
              aria-hidden="true"
            />
            <span
              className={[
                "truncate text-sm",
                slice.isBalanceHighlight ? "font-semibold text-text-primary" : "text-text-primary",
              ].join(" ")}
            >
              {slice.categoryName}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-sm text-text-secondary">
            <span>
              <bdi dir="ltr">{formatIls(slice.displayAmount)}</bdi>
            </span>
            <span className="w-10 text-end text-xs text-text-muted">{formatPercent(slice.percent)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 pb-1.5">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-border-subtle">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(slice.percent, 2)}%`, backgroundColor: slice.color }}
            />
          </div>
        </div>
        {slice.explanation ? (
          <p className="pb-1.5 text-xs text-text-muted">{slice.explanation}</p>
        ) : null}
      </>
    );
  }

  if (slice.isBalanceHighlight) {
    return (
      <>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="inline-block size-3 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
              aria-hidden="true"
            />
            <span className="truncate text-sm font-semibold text-text-primary">
              {slice.categoryName}
            </span>
          </div>
          <span className="shrink-0 text-sm font-semibold text-text-secondary">
            <bdi dir="ltr">{formatIls(slice.displayAmount)}</bdi>
          </span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border-subtle">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(slice.percent, 2)}%`, backgroundColor: slice.color }}
            />
          </div>
          <span className="w-12 shrink-0 text-end text-xs font-medium text-text-muted">
            {formatPercent(slice.percent)}
          </span>
        </div>
        {slice.explanation ? (
          <p className="mt-1 text-xs text-text-muted">{slice.explanation}</p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="inline-block size-3 shrink-0 rounded-full"
            style={{ backgroundColor: slice.color }}
            aria-hidden="true"
          />
          <span className="truncate text-sm text-text-primary">{slice.categoryName}</span>
        </div>
        <span className="shrink-0 text-sm text-text-secondary">
          <bdi dir="ltr">{formatIls(slice.displayAmount)}</bdi>
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border-subtle">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(slice.percent, 2)}%`, backgroundColor: slice.color }}
          />
        </div>
        <span className="w-12 shrink-0 text-end text-xs text-text-muted">
          {formatPercent(slice.percent)}
        </span>
      </div>
      <p className="mt-1 text-xs text-text-muted">{slice.transactionCount} עסקאות</p>
    </>
  );
}

export function DonutLegend({ slices, onSelect, selectedId, dense = false }: DonutLegendProps) {
  const ordered = sortLegendSlices(slices);

  if (dense) {
    return (
      <ul
        className="max-h-72 divide-y divide-border-subtle overflow-y-auto"
        dir="rtl"
        aria-label="פירוט פרוסות"
      >
        {ordered.map((slice) => {
          const key = sliceKey(slice);
          const active = selectedId === key;
          const isHighlight = Boolean(slice.isBalanceHighlight);
          const ariaLabel = `${slice.categoryName}, ${formatIls(slice.displayAmount)}, ${formatPercent(slice.percent)}`;

          if (isHighlight || !onSelect) {
            return (
              <li key={key}>
                <div aria-label={ariaLabel} className="w-full px-1 text-start">
                  <LegendRowContent slice={slice} active={active} dense />
                </div>
              </li>
            );
          }

          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onSelect(slice)}
                aria-label={ariaLabel}
                className={[
                  "w-full px-1 text-start transition",
                  active ? "bg-brand-orange-500/5" : "hover:bg-surface-elevated",
                ].join(" ")}
              >
                <LegendRowContent slice={slice} active={active} dense />
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul className="space-y-2" dir="rtl" aria-label="פירוט פרוסות">
      {ordered.map((slice) => {
        const key = sliceKey(slice);
        const active = selectedId === key;
        const isHighlight = Boolean(slice.isBalanceHighlight);

        if (isHighlight) {
          return (
            <li key={key}>
              <div
                aria-label={`${slice.categoryName}, ${formatIls(slice.displayAmount)}, ${formatPercent(slice.percent)}`}
                className="w-full rounded-lg border border-border-strong bg-surface-elevated px-3 py-2 text-start"
              >
                <LegendRowContent slice={slice} active={active} dense={false} />
              </div>
            </li>
          );
        }

        return (
          <li key={key}>
            <button
              type="button"
              onClick={() => onSelect!(slice)}
              aria-label={`${slice.categoryName}, ${formatIls(slice.displayAmount)}, ${formatPercent(slice.percent)}`}
              className={[
                "w-full rounded-lg border px-3 py-2 text-start transition",
                active
                  ? "border-brand-orange-500/60 bg-brand-orange-500/5"
                  : "border-border-subtle bg-surface-card hover:border-brand-blue-500/40",
              ].join(" ")}
            >
              <LegendRowContent slice={slice} active={active} dense={false} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
