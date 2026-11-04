/**
 * Non-visual alternative to the monthly bars chart.
 */
import { formatIls } from "@/lib/currency";
import { formatYoYDelta } from "./breakdown-utils";
import type { MonthlyBarsMode, YearOverYearRow } from "./types";

type MonthlyBarsDataTableProps = {
  rows: YearOverYearRow[];
  mode: MonthlyBarsMode;
  showYoY: boolean;
};

export function MonthlyBarsDataTable({ rows, mode, showYoY }: MonthlyBarsDataTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border-subtle">
      <table className="min-w-full text-sm">
        <caption className="sr-only">טבלת נתוני חודשים</caption>
        <thead className="bg-surface-card text-text-secondary">
          <tr>
            <th scope="col" className="px-3 py-2 text-start">
              חודש
            </th>
            {mode === "expenses" ? (
              <>
                <th scope="col" className="px-3 py-2 text-start">
                  הוצאות
                </th>
                {showYoY ? (
                  <>
                    <th scope="col" className="px-3 py-2 text-start">
                      שנה קודמת
                    </th>
                    <th scope="col" className="px-3 py-2 text-start">
                      שינוי
                    </th>
                  </>
                ) : null}
              </>
            ) : null}
            {mode === "income-vs-expense" ? (
              <>
                <th scope="col" className="px-3 py-2 text-start">
                  הכנסות
                </th>
                <th scope="col" className="px-3 py-2 text-start">
                  הוצאות
                </th>
                <th scope="col" className="px-3 py-2 text-start">
                  נטו
                </th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.currentPeriod} className="border-t border-border-subtle">
              <td className="px-3 py-2">{row.monthLabel}</td>
              {mode === "expenses" ? (
                <>
                  <td className="px-3 py-2">
                    <bdi dir="ltr">{formatIls(row.currentExpenses)}</bdi>
                  </td>
                  {showYoY ? (
                    <>
                      <td className="px-3 py-2">
                        {row.priorExpenses != null ? (
                          <bdi dir="ltr">{formatIls(row.priorExpenses)}</bdi>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2">{formatYoYDelta(row.yoyExpensePct)}</td>
                    </>
                  ) : null}
                </>
              ) : null}
              {mode === "income-vs-expense" ? (
                <>
                  <td className="px-3 py-2">
                    <bdi dir="ltr">{formatIls(row.currentIncome)}</bdi>
                  </td>
                  <td className="px-3 py-2">
                    <bdi dir="ltr">{formatIls(row.currentExpenses)}</bdi>
                  </td>
                  <td className="px-3 py-2">
                    <bdi dir="ltr">{formatIls(row.currentNet)}</bdi>
                  </td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
