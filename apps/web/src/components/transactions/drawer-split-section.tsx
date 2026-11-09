"use client";

/**
 * Collapsible "split into categories" editor. Splits save on their own button, not the footer.
 * A single row covering the full amount is refused: that is a plain category change, done with the
 * category field at the top of the drawer.
 * Used by: transaction-detail-drawer.
 */
import type { Category } from "@moneytrack/contracts";
import { DrawerCollapsible } from "@/components/transactions/drawer-collapsible";
import { isSingleFullSplit, type SplitRow } from "@/components/transactions/transaction-drawer-helpers";
import he from "@/locales/he.json";

const copy = he.transactionDrawer;
const fieldClass =
  "min-h-11 w-full rounded-md border border-border-subtle bg-surface-card px-2 py-1.5 text-sm";

type DrawerSplitSectionProps = {
  rows: SplitRow[];
  categories: Category[];
  totalAmount: number;
  saving: boolean;
  dirty: boolean;
  onChange: (rows: SplitRow[]) => void;
  onSave: () => void;
};

export function DrawerSplitSection({
  rows,
  categories,
  totalAmount,
  saving,
  dirty,
  onChange,
  onSave,
}: DrawerSplitSectionProps) {
  const singleRow = isSingleFullSplit(rows, totalAmount);

  function patch(index: number, change: Partial<SplitRow>): void {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...change } : row)));
  }

  return (
    <DrawerCollapsible
      title={copy.splitTitle}
      helper={copy.splitHelper}
      badge={dirty ? "●" : undefined}
    >
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="grid gap-2 rounded-lg border border-border-subtle p-3">
            <select
              aria-label={`${copy.splitCategory} ${index + 1}`}
              value={row.categoryId}
              onChange={(event) => patch(index, { categoryId: event.target.value })}
              className={fieldClass}
            >
              <option value="">{copy.splitCategory}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0.01"
              step="0.01"
              aria-label={`${copy.splitAmount} ${index + 1}`}
              value={row.amount}
              onChange={(event) => patch(index, { amount: event.target.value, original: undefined })}
              placeholder={copy.splitAmount}
              dir="ltr"
              className={fieldClass}
            />
            <input
              type="text"
              aria-label={`${copy.splitNote} ${index + 1}`}
              value={row.note}
              onChange={(event) => patch(index, { note: event.target.value })}
              placeholder={copy.splitNote}
              className={fieldClass}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...rows, { categoryId: "", amount: "", note: "" }])}
        className="min-h-11 text-sm font-medium text-brand-blue-500"
      >
        {copy.splitAddRow}
      </button>
      {singleRow ? (
        <p role="status" className="text-xs text-brand-orange-500">
          {copy.splitSingleRow}
        </p>
      ) : null}
      <button
        type="button"
        disabled={saving || singleRow}
        onClick={onSave}
        className="min-h-11 w-full rounded-lg border border-border-subtle px-4 text-sm font-medium hover:bg-surface-elevated disabled:opacity-50"
      >
        {copy.splitSave}
      </button>
    </DrawerCollapsible>
  );
}
