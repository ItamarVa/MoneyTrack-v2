/**
 * Browser fetchers for the attention page that api-client.ts does not already offer.
 * createMerchantRule makes the same call as the /classify uncategorized section
 * (suggestMerchantPattern on the merchant name, shared priority) and returns the rule id for undo.
 */
import { createRule } from "@/lib/api-client";
import { apiUrl } from "@/lib/base-path";
import { MERCHANT_RULE_PRIORITY, suggestMerchantPattern } from "@/lib/merchant-pattern";

/** Returns the created rule id, or null when no pattern can be derived from the name. */
export async function createMerchantRule(
  merchantName: string,
  categoryId: string,
): Promise<string | null> {
  const pattern = suggestMerchantPattern(merchantName);
  if (!pattern) return null;
  const rule = await createRule({
    pattern,
    categoryId,
    priority: MERCHANT_RULE_PRIORITY,
    enabled: true,
  });
  return rule.id;
}

export async function fetchAttentionCount(): Promise<number> {
  const response = await fetch(apiUrl("/api/attention/count"), { cache: "no-store" });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return ((await response.json()) as { count: number }).count;
}
