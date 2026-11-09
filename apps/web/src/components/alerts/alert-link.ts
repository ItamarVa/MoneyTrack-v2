/**
 * Pure builder for the "view" link of an alert: opens /transactions filtered to what the alert is about.
 * Why: alerts only store one transactionId plus type-specific metadata (merchantId, date, categoryId, period),
 * so the filter is rebuilt from those. No ids filter exists in the list API, hence merchant/date/category.
 * Used by attention/alerts-block.tsx and alerts/alerts-page-client.tsx.
 */
import type { Alert } from "@moneytrack/contracts";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD = /^(\d{4})-(\d{2})$/;

function metaOf(alert: Pick<Alert, "metadata">): Record<string, unknown> {
  const raw: unknown = alert.metadata;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function href(params: Record<string, string>): string {
  return `/transactions?${new URLSearchParams(params).toString()}`;
}

export function alertViewHref(alert: Pick<Alert, "type" | "transactionId" | "metadata">): string {
  const meta = metaOf(alert);
  const merchantId = str(meta.merchantId);
  const txId = alert.transactionId;

  if (alert.type === "duplicate" && merchantId) {
    const date = str(meta.date);
    if (date && ISO_DATE.test(date)) return href({ merchantIds: merchantId, dateFrom: date, dateTo: date });
  }
  if (alert.type === "anomaly" && merchantId) {
    return href({ merchantIds: merchantId, period: "all", ...(txId ? { highlight: txId } : {}) });
  }
  if (alert.type === "price_increase" && merchantId) {
    return href({ merchantIds: merchantId, period: "all" });
  }
  if (alert.type === "budget_variance") {
    const categoryId = str(meta.categoryId);
    const match = PERIOD.exec(str(meta.period) ?? "");
    if (categoryId && match) {
      const last = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
      return href({
        categoryIds: categoryId,
        dateFrom: `${match[1]}-${match[2]}-01`,
        dateTo: `${match[1]}-${match[2]}-${String(last).padStart(2, "0")}`,
      });
    }
  }
  return txId ? href({ period: "all", highlight: txId }) : "/alerts";
}
