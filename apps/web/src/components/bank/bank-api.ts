/**
 * Browser calls for the bank page. Reuses fetchTransactionPage (apiUrl() keeps the HA ingress prefix);
 * the only addition is walking every page of a period so the header totals cover the whole period,
 * not just the rows currently loaded in the list.
 * ponytail: capped at MAX_SUMMARY_PAGES * 500 rows; a bank account with more activity in one period
 * would need a server-side sum endpoint.
 */
import type { AnalysisFilter, Transaction } from "@moneytrack/contracts";
import { fetchTransactionPage } from "@/components/transactions/transaction-api";

const SUMMARY_PAGE_SIZE = 500;
const MAX_SUMMARY_PAGES = 10;

export async function fetchAllPeriodRows(filter: AnalysisFilter): Promise<Transaction[]> {
  const rows: Transaction[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_SUMMARY_PAGES; page += 1) {
    const result = await fetchTransactionPage(filter, { cursor, limit: SUMMARY_PAGE_SIZE });
    rows.push(...result.items);
    if (!result.nextCursor) break;
    cursor = result.nextCursor;
  }
  return rows;
}
