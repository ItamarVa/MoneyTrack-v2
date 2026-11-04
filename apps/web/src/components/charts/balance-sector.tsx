/**
 * Shared balance-highlight sector renderer for donut charts.
 * Recharts 3 removed activeIndex; emphasize surplus/deficit slices via the Pie shape prop.
 */
import { Sector } from "recharts";
import type { PieSectorDataItem } from "recharts/types/polar/Pie";

export const BALANCE_POP_FACTOR = 1.07;

export function balanceColor(kind: "surplus" | "deficit"): string {
  return kind === "surplus" ? "var(--chart-surplus)" : "var(--chart-deficit)";
}

export function GlowingSector(
  props: PieSectorDataItem & {
    balanceKind?: "surplus" | "deficit";
    fill?: string;
  },
) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, balanceKind } = props;
  const fill = props.fill ?? balanceColor(balanceKind ?? "surplus");
  const glowId = `donut-glow-${balanceKind ?? "highlight"}`;
  const expandedOuter = (outerRadius ?? 0) * BALANCE_POP_FACTOR;

  return (
    <g className="donut-balance-glow">
      <defs>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor={fill} floodOpacity="0.85" />
        </filter>
      </defs>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={expandedOuter}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
        stroke="var(--surface-card)"
        strokeWidth={2}
        filter={`url(#${glowId})`}
      />
    </g>
  );
}
