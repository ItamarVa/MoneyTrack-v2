"use client";

/**
 * Generic entity detail page: header totals, secondary breakdown ring, 12-month chart,
 * filtered transactions, and optional category insights.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BreakdownDimension, Category, CategoryInsight, Tag } from "@moneytrack/contracts";
import { CategoryInsightsSection } from "@/components/category/category-insights-section";
import { useGlobalPeriod } from "@/components/period/period-context";
import { useScreenPeriod } from "@/components/period/use-screen-period";
import { TransactionDetailDrawer } from "@/components/transactions/transaction-detail-drawer";
import { fetchCategories, fetchCategoryDetail, fetchTags } from "@/lib/api-client";
import { EntityBreakdownSection } from "./entity-breakdown-section";
import { entityPagePath, filterForEntityPeriod } from "./entity-dimension";
import { EntityHeader } from "./entity-header";
import { EntityMonthlySection } from "./entity-monthly-section";
import { EntityTransactionsSection } from "./entity-transactions-section";
import type { EntityDrillStep } from "./entity-types";
import { useEntityHeader } from "./use-entity-header";

type EntityPageClientProps = {
  dimension: BreakdownDimension;
  entityId: string;
  showInsights?: boolean;
};

export function EntityPageClient({
  dimension,
  entityId,
  showInsights = false,
}: EntityPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setPeriod } = useGlobalPeriod();
  const { period, ready } = useScreenPeriod(searchParams.get("period"));

  const filter = useMemo(
    () => filterForEntityPeriod(dimension, entityId, period),
    [dimension, entityId, period],
  );

  const header = useEntityHeader(dimension, entityId, period);
  const [steps, setSteps] = useState<EntityDrillStep[]>([]);
  const [insights, setInsights] = useState<CategoryInsight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [reloadToken, setReloadToken] = useState(0);

  const navigatePeriod = useCallback(
    (nextPeriod: string) => {
      setPeriod(nextPeriod);
      router.replace(`${entityPagePath(dimension, entityId)}?period=${nextPeriod}`);
    },
    [dimension, entityId, router, setPeriod],
  );

  useEffect(() => {
    if (!ready) return;
    const urlPeriod = searchParams.get("period");
    if (urlPeriod !== period) {
      router.replace(`${entityPagePath(dimension, entityId)}?period=${period}`);
    }
  }, [dimension, entityId, period, ready, router, searchParams]);

  useEffect(() => {
    setSteps([]);
  }, [filter]);

  useEffect(() => {
    if (!showInsights || dimension !== "category" || !entityId) {
      setInsights([]);
      return;
    }

    let cancelled = false;
    setInsightsLoading(true);

    void fetchCategoryDetail(entityId, period)
      .then((response) => {
        if (!cancelled) setInsights(response.insights);
      })
      .catch(() => {
        if (!cancelled) setInsights([]);
      })
      .finally(() => {
        if (!cancelled) setInsightsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showInsights, dimension, entityId, period]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchTags(), fetchCategories()])
      .then(([loadedTags, loadedCategories]) => {
        if (!cancelled) {
          setTags(loadedTags);
          setCategories(loadedCategories);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTags([]);
          setCategories([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTransactionChanged = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  if (!entityId) {
    return (
      <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
        ישות לא נמצאה
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-w-0 space-y-4 overflow-x-hidden sm:space-y-6">
      <EntityHeader {...header} />

      <div className="flex flex-col gap-4 sm:gap-6">
        <EntityBreakdownSection
          entityDimension={dimension}
          entityId={entityId}
          entityName={header.title}
          filter={filter}
          steps={steps}
          onStepsChange={setSteps}
          onTransactionSelect={setDetailId}
        />
        <EntityMonthlySection filter={filter} onMonthSelect={navigatePeriod} />
      </div>
      <EntityTransactionsSection
        filter={filter}
        steps={steps}
        onStepsChange={setSteps}
        onRowClick={setDetailId}
        reloadToken={reloadToken}
      />

      {showInsights ? (
        <CategoryInsightsSection insights={insights} loading={insightsLoading} />
      ) : null}

      <TransactionDetailDrawer
        open={detailId !== null}
        transactionId={detailId}
        tags={tags}
        categories={categories}
        onClose={() => setDetailId(null)}
        onChanged={handleTransactionChanged}
      />
    </div>
  );
}
