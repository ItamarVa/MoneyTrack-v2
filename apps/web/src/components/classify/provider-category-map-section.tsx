"use client";

/**
 * MAX provider category → MoneyTrack category mapping editor.
 * Saves each row on change via PUT /api/classify/provider-map (background classify job).
 */
import type { ProviderCategoryMapEntry } from "@moneytrack/contracts";
import { useCallback, useEffect, useState } from "react";
import { CategorySelect } from "@/components/classify/category-select";
import { MobileCardList, MobileCardListItem, PanelDataTable } from "@/components/mobile";
import { useToast } from "@/components/ui/toast";
import { fetchProviderCategoryMap, updateProviderCategoryMap } from "@/lib/api-client";
import { UNCATEGORIZED_CATEGORY_ID } from "@/lib/category-ids";

const categorySelectClass =
  "min-h-11 w-full max-w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-base text-text-primary";

export function ProviderCategoryMapSection() {
  const { showToast } = useToast();
  const [mappings, setMappings] = useState<ProviderCategoryMapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMappings(await fetchProviderCategoryMap());
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת מיפוי");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCategoryChange(
    providerCategory: string,
    categoryId: string,
  ): Promise<void> {
    const resolved =
      categoryId === UNCATEGORIZED_CATEGORY_ID ? null : categoryId;

    setSavingCategory(providerCategory);
    try {
      await updateProviderCategoryMap([
        { providerCategory, categoryId: resolved },
      ]);
      setMappings((current) =>
        current.map((row) =>
          row.providerCategory === providerCategory
            ? { ...row, categoryId: resolved }
            : row,
        ),
      );
      showToast("מיפוי עודכן — סיווג מחדש ברקע", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "שמירת מיפוי נכשלה", "error");
    } finally {
      setSavingCategory(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-12 text-center text-text-muted">
        טוען מיפוי קטגוריות MAX…
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
        <h2 className="font-display text-base font-semibold text-text-primary">מיפוי קטגוריות MAX</h2>
        <p className="mt-1 text-xs text-text-muted">
          כל שורה מקשרת קטגוריה מ-MAX לקטגוריה במערכת
        </p>
      </header>

      <PanelDataTable
        mobileCards={
          <MobileCardList className="p-4">
            {mappings.map((row) => (
              <MobileCardListItem key={row.providerCategory}>
                <div className="space-y-3">
                  <p className="font-medium text-text-primary">{row.providerCategory}</p>
                  <p className="text-xs text-text-muted">
                    עסקאות:{" "}
                    <span className="tabular-nums text-text-secondary">{row.transactionCount}</span>
                  </p>
                  <CategorySelect
                    allowUncategorized
                    value={row.categoryId ?? UNCATEGORIZED_CATEGORY_ID}
                    disabled={savingCategory === row.providerCategory}
                    placeholder={
                      savingCategory === row.providerCategory ? "שומר…" : "בחר קטגוריה"
                    }
                    className={categorySelectClass}
                    onChange={(categoryId) =>
                      void handleCategoryChange(row.providerCategory, categoryId)
                    }
                  />
                </div>
              </MobileCardListItem>
            ))}
          </MobileCardList>
        }
        table={
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-elevated/50 text-xs text-text-muted">
                <th className="px-4 py-3 text-start font-medium">קטגוריה MAX</th>
                <th className="px-4 py-3 text-end font-medium">עסקאות</th>
                <th className="px-4 py-3 text-start font-medium">קטגוריה במערכת</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((row) => (
                <tr
                  key={row.providerCategory}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-surface-elevated/30"
                >
                  <td className="px-4 py-3 font-medium text-text-primary">{row.providerCategory}</td>
                  <td className="px-4 py-3 text-end tabular-nums text-text-secondary">
                    {row.transactionCount}
                  </td>
                  <td className="px-4 py-3">
                    <CategorySelect
                      allowUncategorized
                      value={row.categoryId ?? UNCATEGORIZED_CATEGORY_ID}
                      disabled={savingCategory === row.providerCategory}
                      placeholder={
                        savingCategory === row.providerCategory ? "שומר…" : "בחר קטגוריה"
                      }
                      onChange={(categoryId) =>
                        void handleCategoryChange(row.providerCategory, categoryId)
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        }
      />
    </section>
  );
}
