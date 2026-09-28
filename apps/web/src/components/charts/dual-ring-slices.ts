/**
 * Pure slice shaping for the dual-ring dashboard chart.
 * Recalculates percents against a shared denominator and appends balance highlights.
 */
import type { CategoryBreakdownItem } from "@moneytrack/contracts";
import { balanceColor } from "./balance-sector";
import { breakdownTotal, toDonutSlices } from "./breakdown-utils";
import type { DonutSlice, DualRingBalance } from "./types";

function recalcPercents(slices: DonutSlice[], denominator: number): DonutSlice[] {
  return slices.map((slice) => ({
    ...slice,
    percent: denominator > 0 ? (slice.displayAmount / denominator) * 100 : 0,
  }));
}

function appendHighlight(
  slices: DonutSlice[],
  balance: DualRingBalance,
  ring: "inner" | "outer",
): DonutSlice[] {
  if (!balance.highlight || balance.highlight.ring !== ring) {
    return slices;
  }

  const highlight = balance.highlight;
  const denominator = balance.denominatorIls;
  const recalculated = recalcPercents(slices, denominator);

  return [
    ...recalculated,
    {
      categoryId: null,
      categoryName: highlight.label,
      amountIls: highlight.amountIls,
      transactionCount: 0,
      drillDown: recalculated[0]?.drillDown ?? slices[0]!.drillDown,
      displayAmount: highlight.amountIls,
      percent: denominator > 0 ? (highlight.amountIls / denominator) * 100 : 0,
      color: balanceColor(highlight.kind),
      ring,
      isBalanceHighlight: true,
      balanceKind: highlight.kind,
      explanation: highlight.explanation,
    },
  ];
}

export function buildDualRingSlices(input: {
  outerItems: CategoryBreakdownItem[];
  innerItems: CategoryBreakdownItem[];
  balance: DualRingBalance;
  hideInnerRing?: boolean;
}): { outerSlices: DonutSlice[]; innerSlices: DonutSlice[] } {
  const outerBase = toDonutSlices(input.outerItems, "expense").map((slice) => ({
    ...slice,
    ring: "outer" as const,
  }));
  const innerBase = input.hideInnerRing
    ? []
    : toDonutSlices(input.innerItems, "income").map((slice) => ({ ...slice, ring: "inner" as const }));

  const denominator = input.balance.denominatorIls || Math.max(
    breakdownTotal(input.outerItems),
    breakdownTotal(input.innerItems),
  );

  const balanceForSlices: DualRingBalance = {
    ...input.balance,
    denominatorIls: denominator,
  };

  return {
    outerSlices: appendHighlight(recalcPercents(outerBase, denominator), balanceForSlices, "outer"),
    innerSlices: appendHighlight(recalcPercents(innerBase, denominator), balanceForSlices, "inner"),
  };
}
