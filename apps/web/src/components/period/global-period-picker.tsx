"use client";

/**
 * Header month picker for period-aware routes. Renders null elsewhere so alerts,
 * loans, and settings never show a period control.
 * Below lg it is a full-width header row (arrows + month name always visible, never
 * sharing a line with the logo); from lg up it sits inline beside the header buttons.
 * Must be a direct child of the header flex container so the row can wrap.
 */
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactElement } from "react";
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
  "/credit",
];

function PeriodPickerControls(): ReactElement {
  const { period, setPeriod, isAll } = useGlobalPeriod();
  const monthLabel = isAll ? "כל התקופה" : formatMonthYear(period);
  const arrowClass =
    "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-text-primary hover:bg-surface-elevated disabled:opacity-40";

  return (
    <div className="flex w-full items-center gap-2 text-sm text-text-secondary lg:w-auto">
      <div className="flex min-w-0 flex-1 items-center rounded-xl border border-brand-blue-500/40 bg-brand-blue-500/10 px-1 lg:flex-none lg:gap-1">
        {/* RTL: the first button sits on the right and goes back in time. */}
        <button
          type="button"
          aria-label="חודש קודם"
          disabled={isAll}
          onClick={() => setPeriod(shiftGlobalPeriod(period, -1))}
          className={arrowClass}
        >
          <Icon icon={ChevronRight} size={22} />
        </button>
        <Icon icon={CalendarDays} size={18} className="hidden shrink-0 text-brand-blue-500 sm:block" />
        <span className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-text-primary sm:text-base lg:min-w-[7rem] lg:flex-none">
          {monthLabel}
        </span>
        <button
          type="button"
          aria-label="חודש הבא"
          disabled={isAll}
          onClick={() => setPeriod(shiftGlobalPeriod(period, 1))}
          className={arrowClass}
        >
          <Icon icon={ChevronLeft} size={22} />
        </button>
      </div>
      <button
        type="button"
        aria-pressed={isAll}
        onClick={() => setPeriod(isAll ? currentMonthPeriod() : ALL_PERIOD)}
        className={[
          "min-h-11 shrink-0 rounded-lg border px-2.5 text-sm font-medium transition sm:px-3",
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

  if (!periodAware) {
    return null;
  }

  // basis-full + order-last: wraps under the logo/buttons row below lg, and
  // lg:ms-auto keeps it pushed beside the buttons on desktop.
  return (
    <div className="order-last w-full basis-full lg:order-none lg:ms-auto lg:w-auto lg:basis-auto">
      <PeriodPickerControls />
    </div>
  );
}
