/**
 * Account ids and card ids both name a data source, so a mixed selection must OR.
 * ANDing them returns nothing: a card row's account_id is its settlement account.
 */
import { inArray, or, transactions } from "@moneytrack/db";

export function sourceMatchCondition(
  accountIds?: string[],
  cardIds?: string[],
): ReturnType<typeof inArray> | ReturnType<typeof or> | undefined {
  const parts: Array<ReturnType<typeof inArray>> = [];
  if (accountIds?.length) {
    parts.push(inArray(transactions.accountId, accountIds));
  }
  if (cardIds?.length) {
    parts.push(inArray(transactions.cardId, cardIds));
  }
  if (parts.length === 0) {
    return undefined;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return or(...parts);
}
