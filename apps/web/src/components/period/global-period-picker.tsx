"use client";

/**
 * Header month picker for period-aware routes. Renders null elsewhere so alerts,
 * loans, and settings never show a period control.
 */
import { CalendarDays } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, type ReactElement } from "react";
import { BottomSheet } from "@/components/mobile/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { formatMonthYear } from "@/lib/dates";
import {
  ALL_PERIOD,
  currentMonthPeriod,
  shiftGlobalPeriod,
  useGlobalPeriod,
} from "./period-context";

export const PERIOD_AWARE_PREFIXES: readonly string[] = [
  "/dashboard",
  "/transactions",
  "/analysis",
  "/categories",
  "/entities",
];

function PeriodPickerControls(): ReactElement {
  const { period, setPeriod, isAll } = useGlobalPeriod();
  const monthLabel = isAll ? "כל התקופה" : formatMonthYear(period);

  return (
    <div className="flex shrink flex-wrap items-center justify-center gap-2 text-sm text-text-secondary">
      <div className="flex items-center gap-1 rounded-xl border border-brand-blue-500/40 bg-brand-blue-500/10 px-1 py-0.5">
        <button
          type="button"
          aria-label="חודש קודם"
          disabled={isAll}
          onClick={() => setPeriod(shiftGlobalPeriod(period, -1))}
          className="min-h-11 rounded-lg border border-border-subtle px-3 hover:border-brand-blue-500/40 disabled:opacity-40"
        >
          ‹
        </button>
        <Icon icon={CalendarDays} size={18} className="shrink-0 text-brand-blue-500" />
        <span className="min-w-[7rem] shrink truncate text-center text-base font-semibold text-text-primary">
          {monthLabel}
        </span>
        <button
          type="button"
          aria-label="חודש הבא"
          disabled={isAll}
          onClick={() => setPeriod(shiftGlobalPeriod(period, 1))}
          className="min-h-11 rounded-lg border border-border-subtle px-3 hover:border-brand-blue-500/40 disabled:opacity-40"
        >
          ›
        </button>
      </div>
      <button
        type="button"
        aria-pressed={isAll}
        onClick={() => setPeriod(isAll ? currentMonthPeriod() : ALL_PERIOD)}
        className={[
          "min-h-11 shrink-0 rounded-lg border px-3 text-sm font-medium transition",
          isAll
            ? "border-brand-orange-500/50 bg-brand-orange-500/10 text-brand-orange-500"
            : "border-border-subtle bg-surface-elevated text-text-primary hover:bg-surface-card",
        ].join(" ")}
      >
        כל התקופה
      </button>
    </div>
  );
}

/** Renders null on routes with no period concept. */
export function GlobalPeriodPicker(): ReactElement | null {
  const pathname = usePathname();
  const periodAware = PERIOD_AWARE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const { period, isAll } = useGlobalPeriod();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!periodAware) {
    return null;
  }

  const monthLabel = isAll ? "כל התקופה" : formatMonthYear(period);

  return (
    <>
      <div className="hidden shrink items-center gap-2 text-sm text-text-secondary lg:flex">
        <PeriodPickerControls />
      </div>
      <div className="shrink-0 lg:hidden">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
          className="inline-flex max-w-[9.5rem] min-h-9 items-center gap-1.5 rounded-full border border-brand-blue-500/40 bg-brand-blue-500/10 px-2.5 py-1 text-xs font-semibold text-text-primary"
        >
          <Icon icon={CalendarDays} size={16} className="shrink-0 text-brand-blue-500" />
          <span className="truncate">{monthLabel}</span>
        </button>
        <BottomSheet open={sheetOpen} title="תקופה" onClose={() => setSheetOpen(false)}>
          <PeriodPickerControls />
        </BottomSheet>
      </div>
    </>
  );
}
