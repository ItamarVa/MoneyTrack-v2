/**
 * Non-visual alternative to the donut chart — expandable data table.
 */
import { formatIls } from "@/lib/currency";
import { formatPercent } from "./breakdown-utils";
import type { DonutFlow, DonutSlice } from "./types";

type DonutDataTableProps = {
  slices: DonutSlice[];
  total: number;
  flow?: DonutFlow;
};

function sortTableSlices(slices: DonutSlice[]): DonutSlice[] {
  const highlights = slices.filter((slice) => slice.isBalanceHighlight);
  const categories = slices.filter((slice) => !slice.isBalanceHighlight);
  return [...highlights, ...categories];
}

export function DonutDataTable({ slices, total, flow = "expense" }: DonutDataTableProps) {
  const ordered = sortTableSlices(slices);
  const caption = flow === "income" ? "טבלת פירוט הכנסות" : "טבלת פירוט הוצאות";

  return (
    <div className="overflow-x-auto rounded-lg border border-border-subtle">
      <table className="min-w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-card text-text-secondary">
          <tr>
            <th scope="col" className="px-3 py-2 text-start">
              קטגוריה
            </th>
            <th scope="col" className="px-3 py-2 text-start">
              סכום
            </th>
            <th scope="col" className="px-3 py-2 text-start">
              אחוז
            </th>
            <th scope="col" className="px-3 py-2 text-start">
              עסקאות
            </th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((slice) => (
            <tr
              key={slice.categoryId ?? slice.categoryName}
              className={[
                "border-t border-border-subtle",
                slice.isBalanceHighlight ? "font-semibold" : "",
              ].join(" ")}
            >
              <td className="px-3 py-2">
                <div>{slice.categoryName}</div>
                {slice.explanation ? (
                  <div className="text-xs font-normal text-text-muted">{slice.explanation}</div>
                ) : null}
              </td>
              <td className="px-3 py-2">
                <bdi dir="ltr">{formatIls(slice.displayAmount)}</bdi>
              </td>
              <td className="px-3 py-2">{formatPercent(slice.percent)}</td>
              <td className="px-3 py-2">{slice.isBalanceHighlight ? "—" : slice.transactionCount}</td>
            </tr>
          ))}
          <tr className="border-t border-border-subtle font-medium">
            <td className="px-3 py-2">סה״כ</td>
            <td className="px-3 py-2">
              <bdi dir="ltr">{formatIls(total)}</bdi>
            </td>
            <td className="px-3 py-2">100%</td>
            <td className="px-3 py-2">—</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
