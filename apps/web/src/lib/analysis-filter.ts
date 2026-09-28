import { AnalysisFilterSchema, TransactionKindSchema, type AnalysisFilter, type BreakdownDimension, type TransactionKind } from "@moneytrack/contracts";

export type TransactionSortBy = "date" | "amount" | "description" | "category" | "kind";
export type TransactionSortDir = "asc" | "desc";

const ARRAY_KEYS = ["categoryIds", "tagIds", "personIds", "cardIds", "accountIds", "merchantIds"] as const;
const LIST_ONLY_KEYS = ["kinds"] as const;

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * First and last day of the month containing `reference`. A month is always
 * judged whole — a charge dated later this month is already committed, so the
 * current month is never capped at today. Mirror of monthBounds in
 * app/api/dashboard/home/route.ts.
 */
export function monthBoundsFor(reference: Date): { dateFrom: string; dateTo: string } {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  return {
    dateFrom: localIsoDate(new Date(year, month, 1)),
    dateTo: localIsoDate(new Date(year, month + 1, 0)),
  };
}

/** Move a month-bounded filter one month forward or back (charge-basis navigation). */
export function shiftMonth(filter: AnalysisFilter, direction: -1 | 1): AnalysisFilter {
  const anchor = filter.dateFrom ?? filter.dateTo ?? localIsoDate(new Date());
  const [year, month] = anchor.split("-").map(Number);
  const shifted = new Date(year ?? 0, (month ?? 1) - 1 + direction, 1);
  return { ...filter, dateBasis: filter.dateBasis ?? "charge", ...monthBoundsFor(shifted) };
}

/** Default transactions list filter: current charge month. */
export function defaultTransactionsFilter(): AnalysisFilter {
  return { dateBasis: "charge", ...monthBoundsFor(new Date()) };
}

/** Resolve list filter from URL params; virtual current month when dates are absent. */
export function transactionsFilterFromSearchParams(
  params: URLSearchParams,
  options?: { fallbackFilter?: AnalysisFilter },
): {
  filter: AnalysisFilter;
  allPeriod: boolean;
} {
  const allPeriod = params.get("period") === "all";
  const parsed = filterFromSearchParams(params);
  if (allPeriod) {
    const { dateFrom: _from, dateTo: _to, ...rest } = parsed;
    return { filter: { ...rest, dateBasis: parsed.dateBasis ?? "charge" }, allPeriod: true };
  }
  if (!parsed.dateFrom && !parsed.dateTo) {
    const fallback = options?.fallbackFilter ?? defaultTransactionsFilter();
    return { filter: { ...fallback, ...parsed }, allPeriod: false };
  }
  return { filter: parsed, allPeriod: false };
}

function parseArrayParam(value: string | null): string[] | undefined {
  if (!value) return undefined;
  const items = value.split(",").map((part) => part.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function parseKindsParam(value: string | null): TransactionKind[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => TransactionKindSchema.parse(part));
  return items.length > 0 ? items : undefined;
}

/** Parse URL search params into an analysis filter (bookmarkable state). */
export function filterFromSearchParams(params: URLSearchParams): AnalysisFilter {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) {
    if ((LIST_ONLY_KEYS as readonly string[]).includes(key)) {
      continue;
    }
    if ((ARRAY_KEYS as readonly string[]).includes(key)) {
      raw[key] = parseArrayParam(value);
      continue;
    }
    if (key === "amountMin" || key === "amountMax") {
      raw[key] = Number(value);
      continue;
    }
    if (key === "recurringOnly" || key === "fixedOnly") {
      raw[key] = value === "true";
      continue;
    }
    raw[key] = value;
  }
  return AnalysisFilterSchema.parse(raw);
}

/** List-only kinds filter (not part of AnalysisFilterSchema). */
export function kindsFromSearchParams(params: URLSearchParams): TransactionKind[] | undefined {
  return parseKindsParam(params.get("kinds"));
}

/** Serialize an analysis filter into URL search params. */
export function filterToSearchParams(
  filter: AnalysisFilter,
  options?: { kinds?: TransactionKind[] },
): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.dateFrom) params.set("dateFrom", filter.dateFrom);
  if (filter.dateTo) params.set("dateTo", filter.dateTo);
  if (filter.dateBasis) params.set("dateBasis", filter.dateBasis);
  if (filter.categoryIds?.length) params.set("categoryIds", filter.categoryIds.join(","));
  if (filter.tagIds?.length) params.set("tagIds", filter.tagIds.join(","));
  if (filter.personIds?.length) params.set("personIds", filter.personIds.join(","));
  if (filter.cardIds?.length) params.set("cardIds", filter.cardIds.join(","));
  if (filter.accountIds?.length) params.set("accountIds", filter.accountIds.join(","));
  if (filter.merchantIds?.length) params.set("merchantIds", filter.merchantIds.join(","));
  if (filter.amountMin !== undefined) params.set("amountMin", String(filter.amountMin));
  if (filter.amountMax !== undefined) params.set("amountMax", String(filter.amountMax));
  if (filter.freeText) params.set("freeText", filter.freeText);
  if (filter.recurringOnly) params.set("recurringOnly", "true");
  if (filter.fixedOnly) params.set("fixedOnly", "true");
  if (filter.salaryScope) params.set("salaryScope", filter.salaryScope);
  if (options?.kinds?.length) params.set("kinds", options.kinds.join(","));
  return params;
}

export function drillDownToTransactionsUrl(
  filter: AnalysisFilter,
  options?: { kinds?: TransactionKind[] },
): string {
  const params = filterToSearchParams(filter, options);
  const query = params.toString();
  return query ? `/transactions?${query}` : "/transactions";
}

/** Entity detail page URL for a breakdown slice (category keeps its legacy route). */
export function entityDetailUrl(
  dimension: BreakdownDimension,
  entityId: string,
  period: string,
): string {
  if (dimension === "category") {
    return `/categories/${entityId}?period=${period}`;
  }
  return `/entities/${dimension}/${entityId}?period=${period}`;
}
