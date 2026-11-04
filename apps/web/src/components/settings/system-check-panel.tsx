"use client";

/**
 * Settings view of GET /api/system-check for operators and HA add-on support.
 */
import type { SystemCheckItem, SystemCheckResponse } from "@moneytrack/contracts";
import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "@/lib/base-path";

const statusLabel: Record<SystemCheckItem["status"], string> = {
  pass: "תקין",
  warn: "אזהרה",
  fail: "כשל",
  skipped: "לא נבדק",
};

const statusClass: Record<SystemCheckItem["status"], string> = {
  pass: "bg-money-income/15 text-money-income",
  warn: "bg-brand-orange-500/15 text-brand-orange-600",
  fail: "bg-money-expense/15 text-money-expense",
  skipped: "bg-surface-elevated text-text-muted",
};

async function fetchSystemCheck(): Promise<SystemCheckResponse> {
  const response = await fetch(apiUrl("/api/system-check"), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(response.status === 404 ? "בדיקת מערכת לא זמינה" : "שגיאה בטעינת בדיקה");
  }
  return (await response.json()) as SystemCheckResponse;
}

export function SystemCheckPanel() {
  const [data, setData] = useState<SystemCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchSystemCheck());
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-text-primary">בדיקת מערכת</h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="min-h-10 rounded-lg border border-border-subtle px-4 text-sm font-medium text-text-secondary hover:bg-surface-elevated disabled:opacity-50"
        >
          {loading ? "בודק…" : "הרץ שוב"}
        </button>
      </div>

      {error ? <p className="text-sm text-money-expense">{error}</p> : null}

      {data ? (
        <p className="text-xs text-text-muted">
          עודכן: {new Date(data.ranAt).toLocaleString("he-IL")}
        </p>
      ) : null}

      <ul className="divide-y divide-border-subtle rounded-card border border-border-subtle bg-surface-card">
        {(data?.items ?? []).map((item) => (
          <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="font-medium text-text-primary">{item.label}</p>
              {item.detail ? (
                <p className="mt-0.5 text-sm text-text-muted break-all">{item.detail}</p>
              ) : null}
            </div>
            <span
              className={[
                "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                statusClass[item.status],
              ].join(" ")}
            >
              {statusLabel[item.status]}
            </span>
          </li>
        ))}
        {!loading && !error && (data?.items.length ?? 0) === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-text-muted">אין פריטים</li>
        ) : null}
      </ul>
    </section>
  );
}
