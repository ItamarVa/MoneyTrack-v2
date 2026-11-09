/**
 * Period helpers for entity detail pages. Re-exports from entity-dimension for
 * backward compatibility with category imports.
 */
import type { AnalysisFilter } from "@moneytrack/contracts";
import {
  currentMonthPeriod,
  expandedMonthlyFilter,
  filterForEntityPeriod,
  shiftPeriod,
} from "@/components/entity/entity-dimension";

export { currentMonthPeriod, expandedMonthlyFilter, shiftPeriod };

export function filterForCategoryPeriod(categoryId: string, period: string): AnalysisFilter {
  return filterForEntityPeriod("category", categoryId, period);
}
