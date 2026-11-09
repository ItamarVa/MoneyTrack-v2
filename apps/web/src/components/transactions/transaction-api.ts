/**
 * Transaction list/detail API helpers for the transactions page.
 * Wraps paginated list, detail, update, link, and split endpoints.
 */
import type {
  AnalysisFilter,
  TransactionDetailResponse,
  TransactionKind,
  TransactionLink,
  TransactionLinkRequest,
  TransactionListResponse,
  TransactionRevision,
  TransactionSplit,
  TransactionSplitRequest,
  TransactionUpdateRequest,
} from "@moneytrack/contracts";
import type { TransactionSortBy, TransactionSortDir } from "@/lib/analysis-filter";
import { filterToSearchParams } from "@/lib/analysis-filter";
import { apiUrl } from "@/lib/base-path";

export type TransactionDetailFull = TransactionDetailResponse & {
  splits: TransactionSplit[];
  links: TransactionLink[];
  revisions: TransactionRevision[];
};

async function parseJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed (${response.status})`);
  }
  return data;
}

function mutatingHeaders(): HeadersInit {
  return { "content-type": "application/json" };
}

export async function fetchTransactionPage(
  filter?: Partial<AnalysisFilter>,
  options?: {
    cursor?: string;
    limit?: number;
    freeText?: string;
    sortBy?: TransactionSortBy;
    sortDir?: TransactionSortDir;
    kinds?: TransactionKind[];
  },
): Promise<TransactionListResponse> {
  const params = filter
    ? filterToSearchParams(filter as AnalysisFilter, { kinds: options?.kinds })
    : new URLSearchParams();
  if (options?.cursor) params.set("cursor", options.cursor);
  params.set("limit", String(options?.limit ?? 50));
  if (options?.freeText) params.set("freeText", options.freeText);
  if (options?.sortBy) params.set("sortBy", options.sortBy);
  if (options?.sortDir) params.set("sortDir", options.sortDir);
  return parseJson<TransactionListResponse>(
    await fetch(apiUrl(`/api/transactions?${params.toString()}`), { cache: "no-store" }),
  );
}

export async function fetchTransactionDetail(id: string): Promise<TransactionDetailFull> {
  return parseJson<TransactionDetailFull>(
    await fetch(apiUrl(`/api/transactions/${id}`), { cache: "no-store" }),
  );
}

export async function updateTransaction(
  id: string,
  body: TransactionUpdateRequest,
): Promise<TransactionDetailFull> {
  return parseJson<TransactionDetailFull>(
    await fetch(apiUrl(`/api/transactions/${id}`), {
      method: "PATCH",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function linkTransactions(
  fromId: string,
  body: TransactionLinkRequest,
): Promise<void> {
  await parseJson(
    await fetch(apiUrl(`/api/transactions/${fromId}/link`), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function splitTransaction(
  id: string,
  body: TransactionSplitRequest,
): Promise<TransactionDetailFull> {
  return parseJson<TransactionDetailFull>(
    await fetch(apiUrl(`/api/transactions/${id}/split`), {
      method: "POST",
      headers: mutatingHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

