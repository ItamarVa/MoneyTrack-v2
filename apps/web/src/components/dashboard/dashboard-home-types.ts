/**
 * Fields GET /api/dashboard/home adds on top of DashboardHomeResponse (contracts is owned
 * elsewhere, so these ride beside the parsed body). Type-only and client-safe: the route
 * and the page both import it, so they cannot drift.
 */
import type { DashboardHomeResponse } from "@moneytrack/contracts";
import type { UsualMonth } from "./usual-month";

export type DashboardTopCategory = {
  /** null = uncategorized; the card maps it to the seeded bucket for the link. */
  categoryId: string | null;
  categoryName: string;
  amountIls: number;
};

export type DashboardHomeExtras = {
  /** Null when fewer than two earlier months have expenses, and for the all-period view. */
  usualMonth: UsualMonth | null;
  /** Up to three biggest expense categories of the selected period. */
  topCategories: DashboardTopCategory[];
  /** Newest "YYYY-MM" with income or expenses; only filled when the selected month is empty. */
  latestPeriodWithData: string | null;
  /** True when net worth cannot be the whole picture (no loans entered, or no savings account). */
  netWorthPartial: boolean;
  /** "no_loans" | "no_savings" (engine NetWorthPartialReason). */
  netWorthPartialReasons: string[];
};

export type DashboardHome = DashboardHomeResponse & DashboardHomeExtras;
