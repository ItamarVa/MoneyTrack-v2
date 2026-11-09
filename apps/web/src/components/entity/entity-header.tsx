"use client";

/**
 * Entity detail page header: name, total spend, and MoM delta.
 * Totals come from analysis summary (current vs prior charge month).
 */
import { useRouter } from "next/navigation";
import { formatPeriodChangePct } from "@/components/dashboard/dashboard-utils";
import { formatIls } from "@/lib/currency";
import type { EntityHeaderState } from "./use-entity-header";

type EntityHeaderProps = EntityHeaderState;

function changeToneClass(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct) || pct === 0) return "text-text-muted";
  return pct > 0 ? "text-brand-orange-500" : "text-brand-blue-500";
}

export function EntityHeader({
  title,
  loading,
  error,
  transactionCount,
  totalIls,
  pctChange,
}: EntityHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard");
  };

  return (
    <header className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={handleBack}
            className="mb-2 text-sm text-brand-blue-500 hover:underline"
          >
            ‹ חזרה
          </button>
          <h1 className="font-display text-2xl text-text-primary">{title || "…"}</h1>
          <p className="mt-1 text-sm text-text-muted">
            {loading && !title
              ? "טוען…"
              : transactionCount > 0
                ? `${transactionCount} עסקאות`
                : ""}
          </p>
        </div>
      </div>

      {error ? <p className="text-sm text-brand-orange-500">{error}</p> : null}

      <div className="rounded-card border border-border-subtle bg-surface-card p-4">
        <p className="text-sm text-text-muted">סך הוצאות בחודש</p>
        {loading ? (
          <p className="mt-1 text-text-muted">טוען…</p>
        ) : (
          <>
            <p className="mt-1 font-display text-3xl text-text-primary">
              <bdi dir="ltr">{formatIls(totalIls)}</bdi>
            </p>
            <p className={`mt-1 text-sm ${changeToneClass(pctChange)}`}>
              {formatPeriodChangePct(pctChange)}
            </p>
          </>
        )}
      </div>
    </header>
  );
}
