/**
 * Pure rules for the "card bills that do not match" block of the attention page.
 * Why: the block and GET /api/attention/count must count the same problems, so both use
 * cardBillProblems (last 12 charged months, status mismatch / no_bill, newest first).
 * Reuses recentProblems from the credit page; period "" leaves no month out.
 */
import { recentProblems, type CardMonth } from "@/components/credit/credit-reconciliation-utils";
import type { CardReconciliationRow } from "@/components/credit/credit-types";

export function cardBillProblems(rows: readonly CardReconciliationRow[], today: string): CardMonth[] {
  return recentProblems(
    rows,
    rows.map((row) => row.accountId),
    "",
    today,
  );
}
