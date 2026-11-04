/**
 * Dimension tabs above the drill-down donut.
 */
import type { BreakdownDimension } from "@moneytrack/contracts";
import { DIMENSION_LABELS, SWITCHABLE_DIMENSIONS } from "./types";

type DimensionSwitcherProps = {
  value: BreakdownDimension;
  onChange: (dimension: BreakdownDimension) => void;
  dimensions?: BreakdownDimension[];
  ariaLabel?: string;
};

export function DimensionSwitcher({
  value,
  onChange,
  dimensions = SWITCHABLE_DIMENSIONS,
  ariaLabel = "מימד פירוט",
}: DimensionSwitcherProps) {
  return (
    <div
      className="flex flex-wrap gap-2"
      role="tablist"
      aria-label={ariaLabel}
    >
      {dimensions.map((dimension) => {
        const active = dimension === value;
        return (
          <button
            key={dimension}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(dimension)}
            className={[
              "rounded-full px-3 py-1.5 text-sm transition",
              active
                ? "bg-brand-orange-500 text-white shadow-sm"
                : "border border-border-subtle bg-surface-card text-text-secondary hover:border-brand-blue-500/40",
            ].join(" ")}
          >
            {DIMENSION_LABELS[dimension]}
          </button>
        );
      })}
    </div>
  );
}
