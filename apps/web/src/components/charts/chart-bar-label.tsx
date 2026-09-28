"use client";

/**
 * Recharts bar top labels — compact ILS, hidden when the chart is too narrow.
 */
import type { ReactElement } from "react";
import { formatIlsCompact } from "@/lib/currency";

type BarLabelProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string;
  showLabels?: boolean;
};

export function renderCompactBarLabel(
  showLabels: boolean,
): (props: BarLabelProps) => ReactElement | null {
  return function CompactBarLabel(props: BarLabelProps) {
    if (!showLabels) {
      return null;
    }

    const width = Number(props.width ?? 0);
    if (width < 28) {
      return null;
    }

    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const raw = Number(props.value ?? 0);
    if (!Number.isFinite(raw) || raw === 0) {
      return null;
    }

    return (
      <text
        x={x + width / 2}
        y={y - 4}
        fill="var(--text-secondary)"
        textAnchor="middle"
        fontSize={10}
      >
        {formatIlsCompact(raw)}
      </text>
    );
  };
}
