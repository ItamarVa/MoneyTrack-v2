"use client";

/**
 * Insight cards for a category month, labeled in Hebrew via category-insight-labels.
 */
import type { CategoryInsight } from "@moneytrack/contracts";
import { formatCategoryInsight } from "@/lib/category-insight-labels";

type CategoryInsightsSectionProps = {
  insights: CategoryInsight[];
  loading: boolean;
};

export function CategoryInsightsSection({ insights, loading }: CategoryInsightsSectionProps) {
  return (
    <section
      aria-label="תובנות לקטגוריה"
      className="rounded-card border border-border-subtle bg-surface-card p-4"
    >
      <h2 className="font-display text-lg text-text-primary">תובנות</h2>

      {loading && insights.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border-subtle px-4 py-10 text-center text-sm text-text-muted">
          טוען תובנות…
        </p>
      ) : insights.length === 0 ? (
        <p className="mt-4 rounded-lg border border-border-subtle px-4 py-10 text-center text-sm text-text-muted">
          אין תובנות מיוחדות לחודש זה
        </p>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {insights.map((insight, index) => (
            <li
              key={`${insight.kind}-${index}`}
              className="rounded-lg border border-border-subtle bg-surface-page px-4 py-3 text-sm text-text-primary"
            >
              {formatCategoryInsight(insight)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
