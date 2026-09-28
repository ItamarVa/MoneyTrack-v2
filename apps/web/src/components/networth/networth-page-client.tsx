"use client";

/**
 * Net-worth trend with assets/liabilities lines, period filter, and account breakdown.
 */
import type { Account, NetWorthSnapshot } from "@moneytrack/contracts";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchAccounts, fetchLoans, fetchNetWorthSnapshots } from "@/lib/api-client";
import { chartColor } from "@/lib/chart-colors";
import { formatIls } from "@/lib/currency";
import { formatShortDate } from "@/lib/dates";

type PeriodKey = "3m" | "6m" | "1y" | "all";

const periodLabels: Record<PeriodKey, string> = {
  "3m": "3 חודשים",
  "6m": "6 חודשים",
  "1y": "שנה",
  all: "הכל",
};

function periodCutoff(key: PeriodKey): string | null {
  if (key === "all") return null;
  const now = new Date();
  const months = key === "3m" ? 3 : key === "6m" ? 6 : 12;
  now.setMonth(now.getMonth() - months);
  return now.toISOString().slice(0, 10);
}

const assetKinds = new Set(["checking", "savings", "investment", "cash"]);

export function NetWorthPageClient() {
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loanRows, setLoanRows] = useState<
    { id: string; displayName: string; remainingPrincipal: number }[]
  >([]);
  const [period, setPeriod] = useState<PeriodKey>("6m");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [snapshotRows, accountRows, loans] = await Promise.all([
          fetchNetWorthSnapshots(),
          fetchAccounts(),
          fetchLoans(),
        ]);
        setSnapshots(snapshotRows);
        setAccounts(accountRows);
        setLoanRows(
          loans.map((loan) => ({
            id: loan.id,
            displayName: loan.lender,
            remainingPrincipal: loan.remainingPrincipal,
          })),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "שגיאה בטעינת נתונים");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredSnapshots = useMemo(() => {
    const cutoff = periodCutoff(period);
    if (!cutoff) return snapshots;
    return snapshots.filter((row) => row.asOf >= cutoff);
  }, [snapshots, period]);

  const chartData = useMemo(
    () =>
      filteredSnapshots.map((row) => ({
        asOf: row.asOf,
        label: formatShortDate(row.asOf),
        netWorthIls: row.netWorthIls,
        assets: row.totalAssetsIls,
        liabilities: row.totalLiabilitiesIls,
      })),
    [filteredSnapshots],
  );

  const latest = filteredSnapshots.at(-1) ?? snapshots.at(-1);
  const assetAccounts = accounts.filter((row) => assetKinds.has(row.kind));
  const liabilityTotal = loanRows.reduce((sum, row) => sum + row.remainingPrincipal, 0);

  if (loading) {
    return (
      <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
        טוען שווי נקי…
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

  if (snapshots.length === 0) {
    return (
      <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
        אין עדיין נתוני שווי נקי. הנתונים יתעדכנו לאחר סנכרון חשבונות וחישוב יומי.
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden sm:space-y-6">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(periodLabels) as PeriodKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setPeriod(key)}
            className={[
              "min-h-10 rounded-lg px-4 text-sm font-medium",
              period === key
                ? "bg-brand-orange-500 text-white"
                : "border border-border-subtle text-text-secondary hover:bg-surface-elevated",
            ].join(" ")}
          >
            {periodLabels[key]}
          </button>
        ))}
      </div>

      {latest ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-card border border-border-subtle bg-surface-card p-5">
            <p className="text-sm text-text-secondary">שווי נקי נוכחי</p>
            <p className="mt-2 font-display text-xl text-brand-blue-500 sm:text-2xl">
              <bdi dir="ltr">{formatIls(latest.netWorthIls)}</bdi>
            </p>
          </div>
          <div className="rounded-card border border-border-subtle bg-surface-card p-5">
            <p className="text-sm text-text-secondary">נכסים</p>
            <p className="mt-2 font-display text-xl sm:text-2xl">
              <bdi dir="ltr">{formatIls(latest.totalAssetsIls)}</bdi>
            </p>
          </div>
          <div className="rounded-card border border-border-subtle bg-surface-card p-5">
            <p className="text-sm text-text-secondary">התחייבויות</p>
            <p className="mt-2 font-display text-xl text-brand-orange-500 sm:text-2xl">
              <bdi dir="ltr">{formatIls(latest.totalLiabilitiesIls)}</bdi>
            </p>
          </div>
        </div>
      ) : null}

      <div className="min-w-0 rounded-card border border-border-subtle bg-surface-card p-4" dir="ltr">
        <h2 className="mb-4 font-display text-lg text-text-primary" dir="rtl">
          מגמת שווי נקי
        </h2>
        <div className="h-72 min-w-0 w-full sm:h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border-subtle" />
            <XAxis dataKey="label" reversed />
            <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
            <Tooltip
              content={({
                active,
                payload,
                label,
              }: {
                active?: boolean;
                payload?: ReadonlyArray<{ name?: string; value?: number }>;
                label?: string;
              }) => {
                if (!active || !payload?.length) return null;
                const seriesLabel = (name: string) => {
                  if (name === "netWorthIls") return "שווי נקי";
                  if (name === "assets") return "נכסים";
                  return "התחייבויות";
                };
                return (
                  <div
                    dir="rtl"
                    className="rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm shadow-sm"
                  >
                    <p className="font-medium text-text-primary">תאריך: {label}</p>
                    {payload.map((entry) => (
                      <p key={String(entry.name)} className="text-text-secondary">
                        {seriesLabel(String(entry.name))}:{" "}
                        <bdi dir="ltr">{formatIls(Number(entry.value))}</bdi>
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            <Legend
              formatter={(value: string) => {
                if (value === "netWorthIls") return "שווי נקי";
                if (value === "assets") return "נכסים";
                return "התחייבויות";
              }}
              wrapperStyle={{ direction: "rtl" }}
            />
            <Line
              type="monotone"
              dataKey="netWorthIls"
              stroke={chartColor(0)}
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="assets"
              stroke={chartColor(2)}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="liabilities"
              stroke={chartColor(1)}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
            />
          </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <section className="min-w-0 rounded-card border border-border-subtle bg-surface-card p-5">
        <h2 className="font-display text-lg text-text-primary">פירוט לפי חשבון</h2>
        <p className="mt-1 text-sm text-text-muted">
          יתרות בנק מסונכרנות מסכמות לשורת הנכסים; הלוואות מפורטות בנפרד.
        </p>

        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-text-secondary">נכסים ({assetAccounts.length})</h3>
            {assetAccounts.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">אין חשבונות נכסים רשומים.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {assetAccounts.map((account) => (
                  <li
                    key={account.id}
                    className="flex justify-between gap-2 rounded-lg bg-surface-elevated px-3 py-2"
                  >
                    <span>{account.displayName}</span>
                    <span className="text-text-muted">{account.kind}</span>
                  </li>
                ))}
              </ul>
            )}
            {latest ? (
              <p className="mt-3 text-sm font-medium">
                סה״כ נכסים: <bdi dir="ltr">{formatIls(latest.totalAssetsIls)}</bdi>
              </p>
            ) : null}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-text-secondary">התחייבויות ({loanRows.length})</h3>
            {loanRows.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">אין הלוואות רשומות.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {loanRows.map((loan) => (
                  <li
                    key={loan.id}
                    className="flex justify-between gap-2 rounded-lg bg-surface-elevated px-3 py-2"
                  >
                    <span>{loan.displayName}</span>
                    <bdi dir="ltr">{formatIls(loan.remainingPrincipal)}</bdi>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-sm font-medium">
              סה״כ הלוואות: <bdi dir="ltr">{formatIls(liabilityTotal)}</bdi>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
