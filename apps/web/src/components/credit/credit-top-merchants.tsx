/**
 * Top five merchants by card spend for the chosen month and basis: name, amount and a
 * share bar. Read-only on purpose — the merchant page is not card-scoped, so a link
 * there would show numbers that disagree with this screen.
 */
import type { CategoryBreakdownItem } from "@moneytrack/contracts";
import { localizeBreakdownLabel } from "@/lib/breakdown-labels";
import { formatIls } from "@/lib/currency";
import he from "@/locales/he.json";
import { sharePercent, topMerchants } from "./credit-utils";

export function CreditTopMerchants({ items }: { items: CategoryBreakdownItem[] }) {
  const top = topMerchants(items);
  if (top.length === 0) return null;
  const total = items.reduce((sum, item) => sum + Math.max(item.amountIls, 0), 0);

  return (
    <section
      aria-label={he.creditPage.merchants.title}
      className="rounded-card border border-border-subtle bg-surface-card p-4"
    >
      <h2 className="font-display text-lg text-text-primary">{he.creditPage.merchants.title}</h2>
      <ol className="mt-2 divide-y divide-border-subtle">
        {top.map((item) => (
          <li key={item.categoryId ?? item.categoryName} className="py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-text-primary">
                {localizeBreakdownLabel(item.categoryName)}
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums text-text-primary">
                <bdi dir="ltr">{formatIls(item.amountIls)}</bdi>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-border-subtle" aria-hidden="true">
              <div
                className="h-full rounded-full bg-brand-blue-500"
                style={{ width: `${Math.max(sharePercent(item.amountIls, total), 2)}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
