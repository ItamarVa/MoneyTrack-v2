"use client";

/**
 * Uncategorized merchants grouped by merchant — one-click rule creation on category pick.
 * Pattern uses suggestMerchantPattern on the merchant display name (priority 10).
 */
import type { UncategorizedMerchant } from "@moneytrack/contracts";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fillTemplate } from "@/components/category/category-options";
import { EmptyState } from "@/components/empty-state";
import { CategorySelect } from "@/components/classify/category-select";
import { filterAndSortMerchants, type MerchantSort } from "@/components/classify/merchant-filter";
import { MobileCardList, MobileCardListItem, PanelDataTable } from "@/components/mobile";
import { useToast } from "@/components/ui/toast";
import { createRule, fetchCategories, fetchUncategorizedMerchants } from "@/lib/api-client";
import { formatIls } from "@/lib/currency";
import { suggestMerchantPattern } from "@/lib/merchant-pattern";
import he from "@/locales/he.json";

const copy = he.classify.merchants;
const copy2 = he.plainUx.merchants;
const categorySelectClass =
  "min-h-11 w-full max-w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-base text-text-primary";

const filterCopy = he.classifyFilter;


function merchantTransactionsUrl(merchantId: string): string {
  const params = new URLSearchParams();
  params.set("merchantIds", merchantId);
  params.set("period", "all");
  return `/transactions?${params.toString()}`;
}

export function UncategorizedMerchantsSection() {
  const router = useRouter();
  const { showToast } = useToast();
  const [merchants, setMerchants] = useState<UncategorizedMerchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingMerchantId, setSavingMerchantId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<MerchantSort>("amount");
  const [categoryNameById, setCategoryNameById] = useState<Map<string, string>>(() => new Map());

  const load = useCallback(async () => {
    setError(null);
    try {
      const [rows, categories] = await Promise.all([
        fetchUncategorizedMerchants(),
        fetchCategories(),
      ]);
      setMerchants(rows);
      setCategoryNameById(new Map(categories.map((row) => [row.id, row.name])));
    } catch (err) {
      setError(err instanceof Error ? err.message : copy2.loadFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCategoryPick(merchant: UncategorizedMerchant, categoryId: string): Promise<void> {
    const pattern = suggestMerchantPattern(merchant.merchantName);
    if (!pattern) {
      showToast("לא ניתן ליצור תבנית מהשם", "error");
      return;
    }

    setSavingMerchantId(merchant.merchantId);
    try {
      await createRule({
        pattern,
        categoryId,
        priority: 10,
        enabled: true,
      });
      setMerchants((current) => current.filter((row) => row.merchantId !== merchant.merchantId));
      const label = categoryNameById.get(categoryId) ?? "קטגוריה";
      showToast(`נוצר כלל ל"${pattern}" → ${label}`, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "יצירת כלל נכשלה", "error");
    } finally {
      setSavingMerchantId(null);
    }
  }

  const visible = useMemo(
    () => filterAndSortMerchants(merchants, query, sort),
    [merchants, query, sort],
  );

  if (loading) {
    return (
      <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-12 text-center text-text-muted">
        {copy2.loading}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card border border-brand-orange-500/40 bg-surface-card px-6 py-8 text-center text-brand-orange-500">
        {error}
      </div>
    );
  }

  return (
    <section className="rounded-card border border-border-subtle bg-surface-card shadow-sm">
      <header className="border-b border-border-subtle px-5 py-4">
        <h2 className="font-display text-base font-semibold text-text-primary">{copy2.title}</h2>
        <p className="mt-1 text-xs text-text-muted">
          {copy2.hint}
        </p>
      </header>

      {merchants.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title={copy2.emptyTitle}
            description={copy2.emptyDescription}
          />
        </div>
      ) : (
        <>
        <div className="flex flex-col gap-3 border-b border-border-subtle px-5 py-4 sm:flex-row sm:items-center">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={filterCopy.searchLabel}
            placeholder={filterCopy.searchPlaceholder}
            className={`${categorySelectClass} sm:flex-1`}
          />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as MerchantSort)}
            aria-label={filterCopy.sortLabel}
            className={`${categorySelectClass} sm:w-56`}
          >
            <option value="amount">{filterCopy.sortAmount}</option>
            <option value="count">{filterCopy.sortCount}</option>
            <option value="name">{filterCopy.sortName}</option>
          </select>
          <p className="text-xs text-text-muted" role="status" aria-live="polite">
            {fillTemplate(filterCopy.showing, { visible: visible.length, total: merchants.length })}
          </p>
        </div>
        {visible.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-text-muted">{filterCopy.noMatches}</p>
        ) : (
        <PanelDataTable
          mobileCards={
            <MobileCardList className="p-4">
              {visible.map((merchant) => (
                <MobileCardListItem
                  key={merchant.merchantId}
                  onClick={() => router.push(merchantTransactionsUrl(merchant.merchantId))}
                >
                  <div className="space-y-3">
                    <p className="font-medium text-text-primary">{merchant.merchantName}</p>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-text-secondary">
                      <dt className="text-text-muted">עסקאות</dt>
                      <dd className="text-end tabular-nums">{merchant.transactionCount}</dd>
                      <dt className="text-text-muted">סכום</dt>
                      <dd className="text-end tabular-nums">{formatIls(merchant.totalAmountIls)}</dd>
                    </dl>
                    {merchant.providerCategories.length > 0 ? (
                      <p className="text-xs text-text-muted">
                        {copy.providerCategoriesPrefix} {merchant.providerCategories.join(" · ")}
                      </p>
                    ) : null}
                    <div
                      className="border-t border-border-subtle pt-3"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <CategorySelect
                        value={null}
                        disabled={savingMerchantId === merchant.merchantId}
                        placeholder={
                          savingMerchantId === merchant.merchantId ? "שומר…" : "בחר קטגוריה"
                        }
                        className={categorySelectClass}
                        onChange={(categoryId) => void handleCategoryPick(merchant, categoryId)}
                      />
                    </div>
                  </div>
                </MobileCardListItem>
              ))}
            </MobileCardList>
          }
          table={
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-elevated/50 text-xs text-text-muted">
                  <th className="px-4 py-3 text-start font-medium">{copy2.column}</th>
                  <th className="px-4 py-3 text-end font-medium">עסקאות</th>
                  <th className="px-4 py-3 text-end font-medium">סכום</th>
                  <th className="px-4 py-3 text-start font-medium">{copy.providerCategoriesColumn}</th>
                  <th className="px-4 py-3 text-start font-medium">קטגוריה</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((merchant) => (
                  <tr
                    key={merchant.merchantId}
                    className="cursor-pointer border-b border-border-subtle last:border-b-0 hover:bg-surface-elevated/30"
                    onClick={() => router.push(merchantTransactionsUrl(merchant.merchantId))}
                  >
                    <td className="px-4 py-3 font-medium text-text-primary">{merchant.merchantName}</td>
                    <td className="px-4 py-3 text-end tabular-nums text-text-secondary">
                      {merchant.transactionCount}
                    </td>
                    <td className="px-4 py-3 text-end tabular-nums text-text-secondary">
                      {formatIls(merchant.totalAmountIls)}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-muted">
                      {merchant.providerCategories.length > 0
                        ? merchant.providerCategories.join(" · ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
                      <CategorySelect
                        value={null}
                        disabled={savingMerchantId === merchant.merchantId}
                        placeholder={savingMerchantId === merchant.merchantId ? "שומר…" : "בחר קטגוריה"}
                        onChange={(categoryId) => void handleCategoryPick(merchant, categoryId)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        />
        )}
        </>
      )}
    </section>
  );
}
