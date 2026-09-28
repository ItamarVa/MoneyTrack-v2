"use client";

/**
 * Dashboard home: KPI strip, drill-down donut, budgets, cashflow forecast,
 * recent transactions, alerts preview, and monthly trend bars.
 */
import type {
  Alert,
  CashflowForecastResponse,
  DashboardHomeResponse,
  TrendPoint,
} from "@moneytrack/contracts";
import { useEffect, useMemo, useState } from "react";
import { MonthlyBarsPanel } from "@/components/charts/monthly-bars-panel";
import { SkeletonCardGrid, SkeletonPanel } from "@/components/ui/skeleton";
import {
  periodToFilter,
  useGlobalPeriod,
} from "@/components/period/period-context";
import { useScreenPeriod } from "@/components/period/use-screen-period";
import {
  fetchAlerts,
  fetchCashflowForecast,
  fetchCategoryTrend,
  fetchDashboardHome,
} from "@/lib/api-client";
import { DashboardAlertsPreview } from "./dashboard-alerts-preview";
import { DashboardBudgetBars } from "./dashboard-budget-bars";
import { DashboardCashflowForecast } from "./dashboard-cashflow-forecast";
import { DashboardRingsSection } from "./dashboard-rings-section";
import { DashboardKpiStrip } from "./dashboard-kpi-strip";
import { DashboardRecentTransactions } from "./dashboard-recent-transactions";

export function DashboardPageClient() {
  const { period } = useScreenPeriod(null);
  const { setPeriod } = useGlobalPeriod();
  const ringsFilter = useMemo(() => periodToFilter(period), [period]);
  const [home, setHome] = useState<DashboardHomeResponse | null>(null);
  const [forecast, setForecast] = useState<CashflowForecastResponse | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [trendPoints, setTrendPoints] = useState<TrendPoint[]>([]);
  const [loadingHome, setLoadingHome] = useState(true);
  const [loadingExtras, setLoadingExtras] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoadingHome(true);
      setError(null);
      try {
        const homeData = await fetchDashboardHome(period);
        if (!cancelled) {
          setHome(homeData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "שגיאה בטעינת לוח הבקרה");
        }
      } finally {
        if (!cancelled) {
          setLoadingHome(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [period]);

  useEffect(() => {
    if (!home) return;

    let cancelled = false;
    setLoadingExtras(true);

    const series = home.monthlySeries;
    const firstPeriod = series[0]?.period;
    const lastPeriod = series[series.length - 1]?.period;
    const trendFilter =
      firstPeriod && lastPeriod
        ? (() => {
            const [endYear, endMonth] = lastPeriod.split("-").map(Number);
            // Last day of the closing month, built as a string: toISOString would
            // shift local midnight back a day on a positive UTC offset.
            const lastDay = new Date(Date.UTC(endYear!, endMonth!, 0)).getUTCDate();
            return {
              dateBasis: "charge" as const,
              dateFrom: `${firstPeriod}-01`,
              dateTo: `${lastPeriod}-${String(lastDay).padStart(2, "0")}`,
            };
          })()
        : periodToFilter(period);

    void Promise.all([
      fetchCashflowForecast(30),
      fetchAlerts(),
      fetchCategoryTrend(trendFilter),
    ])
      .then(([forecastData, alertRows, trendData]) => {
        if (!cancelled) {
          setForecast(forecastData);
          setAlerts(alertRows);
          setTrendPoints(trendData.points);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "שגיאה בטעינת נתוני לוח הבקרה");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingExtras(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [home, period]);

  const monthlyPeriodLabel = useMemo(() => {
    if (!home || home.monthlySeries.length === 0) return "6 חודשים אחרונים";
    const first = home.monthlySeries[0]!.period;
    const last = home.monthlySeries[home.monthlySeries.length - 1]!.period;
    return `${first} — ${last}`;
  }, [home]);

  const handleMonthSelect = (nextPeriod: string) => {
    setPeriod(nextPeriod);
    document.getElementById("dashboard-donut")?.scrollIntoView({ behavior: "smooth" });
  };

  if (loadingHome || !home) {
    return (
      <div className="min-w-0 space-y-6 overflow-x-hidden md:space-y-8">
        <div>
          <h1 className="font-display text-2xl text-text-primary md:text-3xl">לוח בקרה</h1>
          <p className="mt-1 text-sm text-text-muted">תמונת מצב מהירה של המשק בית</p>
        </div>
        <SkeletonCardGrid count={4} />
        <div className="grid gap-6 xl:grid-cols-3">
          <SkeletonPanel lines={6} />
          <SkeletonPanel lines={4} />
          <SkeletonPanel lines={4} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-6 overflow-x-hidden md:space-y-8">
      <div>
        <h1 className="font-display text-2xl text-text-primary md:text-3xl">לוח בקרה</h1>
        <p className="mt-1 text-sm text-text-muted">תמונת מצב מהירה של המשק בית — {home.periodLabel}</p>
      </div>

      {error ? (
        <p className="rounded-lg border border-brand-orange-500/30 bg-brand-orange-500/5 px-4 py-3 text-sm text-brand-orange-500">
          {error}
        </p>
      ) : null}

      <DashboardKpiStrip data={home} />

      <div id="dashboard-donut">
        <DashboardRingsSection filter={ringsFilter} />
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <DashboardBudgetBars budgets={home.topBudgets} />
        <DashboardCashflowForecast forecast={forecast} loading={loadingExtras} />
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <DashboardRecentTransactions transactions={home.recentTransactions} />
        <DashboardAlertsPreview
          alerts={alerts}
          openCount={home.openAlerts}
          loading={loadingExtras}
        />
      </div>

      <MonthlyBarsPanel
        monthlySeries={home.monthlySeries}
        trendPoints={trendPoints}
        periodLabel={monthlyPeriodLabel}
        selectedPeriod={period}
        onMonthSelect={handleMonthSelect}
      />
    </div>
  );
}
