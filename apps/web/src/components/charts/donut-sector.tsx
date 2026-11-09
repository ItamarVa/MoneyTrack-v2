/**
 * Pie `shape` renderer shared by both donuts: emphasizes the selected slice, dims the rest,
 * and wraps each sector in a focusable group so Enter/Space select it from the keyboard.
 * Gotcha: the `.recharts-sector` class on the inner path is what the background-click check in
 * donut-selection.ts relies on. Used by: dual-ring-donut.tsx, drill-down-donut.tsx.
 */
import type { KeyboardEvent, ReactElement } from "react";
import { Sector } from "recharts";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";
import { formatIls } from "@/lib/currency";
import { GlowingSector } from "./balance-sector";
import { formatPercent } from "./breakdown-utils";
import { sliceKey } from "./donut-selection";
import type { DonutSlice } from "./types";

const SELECTED_POP_PX = 6;
const DIMMED_OPACITY = 0.35;

type SectorOptions = {
  selectedKey: string | null;
  onActivate: (slice: DonutSlice) => void;
  /** Idle stroke between slices; DrillDownDonut uses none, DualRingDonut a card-coloured gap. */
  idleStroke?: string;
  idleStrokeWidth?: number;
};

export function renderSelectableSector(
  props: PieSectorDataItem,
  { selectedKey, onActivate, idleStroke, idleStrokeWidth = 0 }: SectorOptions,
): ReactElement {
  const slice = props.payload as DonutSlice;
  const selected = selectedKey === sliceKey(slice);
  const dimmed = selectedKey !== null && !selected;
  const outerRadius = (props.outerRadius ?? 0) + (selected ? SELECTED_POP_PX : 0);
  const label = `${slice.categoryName}, ${formatIls(slice.displayAmount)}, ${formatPercent(slice.percent)}`;

  const onKeyDown = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate(slice);
    }
  };

  return (
    <g
      tabIndex={0}
      role="button"
      aria-label={label}
      aria-pressed={selected}
      onKeyDown={onKeyDown}
      style={{ opacity: dimmed ? DIMMED_OPACITY : 1, transition: "opacity 150ms" }}
    >
      {slice.isBalanceHighlight ? (
        <GlowingSector {...props} outerRadius={outerRadius} balanceKind={slice.balanceKind} fill={slice.color} />
      ) : (
        <Sector
          {...props}
          outerRadius={outerRadius}
          fill={slice.color}
          stroke={selected ? "var(--brand-orange-500)" : idleStroke}
          strokeWidth={selected ? 2 : idleStrokeWidth}
        />
      )}
    </g>
  );
}
