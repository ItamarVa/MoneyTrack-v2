import type { BreakdownDimension } from "@moneytrack/contracts";

export type EntityDrillStep = {
  dimension: BreakdownDimension;
  id: string;
  name: string;
};

export type SelectedBreakdownSlice = {
  id: string;
  name: string;
  dimension: BreakdownDimension;
};
