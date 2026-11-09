/**
 * Select-then-drill model shared by DualRingDonut and DrillDownDonut.
 * Why: on touch there is no hover, so a first tap must reveal what a slice is
 * and only an explicit second action (readout button, or tapping the same slice) drills.
 * Invariants: balance highlights never drill (caller passes canDrill=false); `sliceKey` is the
 * single key format used by chart sectors, legend rows and the readout.
 * Used by: dual-ring-donut.tsx, drill-down-donut.tsx, donut-legend.tsx.
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import type { DonutSlice } from "./types";

export type SelectionAction =
  | { type: "tap"; key: string; canDrill: boolean }
  | { type: "clear" };

export type SelectionResult = {
  selectedKey: string | null;
  /** True when this action should run the slice's drill/navigation. */
  drill: boolean;
};

export function sliceKey(slice: DonutSlice): string {
  if (slice.isBalanceHighlight) {
    return `balance-${slice.ring ?? "ring"}-${slice.balanceKind ?? "highlight"}`;
  }
  return `${slice.ring ?? "slice"}-${slice.categoryId ?? slice.categoryName}`;
}

export function reduceSelection(selectedKey: string | null, action: SelectionAction): SelectionResult {
  if (action.type === "clear") {
    return { selectedKey: null, drill: false };
  }
  if (selectedKey === action.key && action.canDrill) {
    // Selection closes on drill: the slice may no longer exist afterwards.
    return { selectedKey: null, drill: true };
  }
  return { selectedKey: action.key, drill: false };
}

type UseDonutSelectionOptions = {
  canDrill: (slice: DonutSlice) => boolean;
  onDrill: (slice: DonutSlice) => void;
};

export function useDonutSelection({ canDrill, onDrill }: UseDonutSelectionOptions) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  const tap = useCallback(
    (slice: DonutSlice) => {
      const result = reduceSelection(selectedKey, {
        type: "tap",
        key: sliceKey(slice),
        canDrill: canDrill(slice),
      });
      setSelectedKey(result.selectedKey);
      if (result.drill) {
        onDrill(slice);
      }
    },
    [canDrill, onDrill, selectedKey],
  );

  const clear = useCallback(() => setSelectedKey(null), []);

  // Tapping outside the whole chart section, or pressing Escape, clears the selection.
  useEffect(() => {
    if (selectedKey === null) {
      return undefined;
    }
    const onPointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      if (container && event.target instanceof Node && !container.contains(event.target)) {
        setSelectedKey(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedKey(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedKey]);

  // Click on chart whitespace (anything that is not a sector) clears.
  const onChartBackgroundClick = useCallback((event: MouseEvent<HTMLElement>) => {
    if (!(event.target instanceof Element) || !event.target.closest(".recharts-sector")) {
      setSelectedKey(null);
    }
  }, []);

  return {
    selectedKey,
    tap,
    clear,
    onChartBackgroundClick,
    containerRef: containerRef as RefObject<HTMLElement | null>,
  };
}
