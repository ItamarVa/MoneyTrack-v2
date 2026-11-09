/**
 * Top five merchants by card spend for the chosen month and basis: name, category, amount and
 * a share bar coloured like the category ring. Tapping a merchant filters the page's
 * transactions to it (merchantIds); the active merchant shows as a chip with an × to clear.
 */
import type { Category, CategoryBreakdownItem } from "@moneytrack/contracts";
import { fillTemplate } from "@/components/category/category-options";
import { localizeBreakdownLabel } from "@/lib/breakdown-labels";
import { formatIls } from "@/lib/currency";
import he from "@/locales/he.json";
import { categoryColor, sharePercent, topMerchants } from "./credit-utils";

type CreditTopMerchantsProps = {
  items: CategoryBreakdownItem[];
  categories: Category[];
  /** merchantId -> categoryId */
  merchantCategories: ReadonlyMap<string, string>;
  /** categoryId -> ring colour */
  categoryColors: ReadonlyMap<string, string>;
  activeMerchantId: string | null;
  onSelectMerchant: (merchantId: string | null) => void;
};

export function CreditTopMerchants({
  items,
  categories,
  merchantCategories,
  categoryColors,
  activeMerchantId,
  onSelectMerchant,
}: CreditTopMerchantsProps) {
  const top = topMerchants(items);
  if (top.length === 0) return null;
  const total = items.reduce((sum, item) => sum + Math.max(item.amountIls, 0), 0);
  const active = items.find((item) => item.categoryId === activeMerchantId);

  return (
    <section
      aria-label={he.creditPage.merchants.title}
      className="rounded-card border border-border-subtle bg-surface-card p-4"
    >
      <h2 className="font-display text-lg text-text-primary">{he.creditPage.merchants.title}</h2>
      {active ? (
        <button
          type="button"
          onClick={() => onSelectMerchant(null)}
          aria-label={fillTemplate(he.credit.filters.clearMerchant, { name: localizeBreakdownLabel(active.categoryName) })}
          className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-brand-blue-500 bg-brand-blue-500/15 px-4 text-sm font-medium text-brand-blue-500"
        >
          <span>{fillTemplate(he.credit.filters.merchantChip, { name: localizeBreakdownLabel(active.categoryName) })}</span>
          <span aria-hidden="true">×</span>
        </button>
      ) : (
        <p className="mt-1 text-xs text-text-muted">{he.credit.filters.merchantHint}</p>
      )}
      <ol className="mt-1 divide-y divide-border-subtle">
        {top.map((item) => {
          const merchantId = item.categoryId;
          const categoryId = merchantId ? (merchantCategories.get(merchantId) ?? null) : null;
          const categoryName = categoryId ? categories.find((category) => category.id === categoryId)?.name : null;
          const isActive = merchantId !== null && merchantId === activeMerchantId;
          const name = localizeBreakdownLabel(item.categoryName);
          return (
            <li key={merchantId ?? item.categoryName}>
              <button
                type="button"
                disabled={merchantId === null}
                aria-pressed={isActive}
                onClick={() => onSelectMerchant(isActive ? null : merchantId)}
                className="block min-h-11 w-full py-2.5 text-start"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-text-primary">
                    {categoryName ? `${name} (${localizeBreakdownLabel(categoryName)})` : name}
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-text-primary">
                    <bdi dir="ltr">{formatIls(item.amountIls)}</bdi>
                  </span>
                </span>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-border-subtle" aria-hidden="true">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.max(sharePercent(item.amountIls, total), 2)}%`,
                      backgroundColor: categoryColor(categoryId, categoryColors),
                    }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
