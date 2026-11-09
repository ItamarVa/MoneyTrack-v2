"use client";

/**
 * Settings → budgets: suggested budgets (one-click activate), the month's budgets with
 * progress bars, and a manual add form. Period selector defaults to the current month.
 * Not used on /analysis any more (that page shows budget-summary.tsx).
 */
import type { BudgetWithVariance, Category } from "@moneytrack/contracts";
import { Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LabelledField } from "@/components/ui/labelled-field";
import { useToast } from "@/components/ui/toast";
import { createBudget, fetchBudgets, fetchCategories } from "@/lib/api-client";
import { formatIls } from "@/lib/currency";
import { formatMonthYear } from "@/lib/dates";
import he from "@/locales/he.json";
import { deleteBudget, updateBudget } from "./budget-api";
import { BudgetProgressBar } from "./budget-progress-bar";
import { BudgetSuggestionsSection } from "./budget-suggestions-section";

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function BudgetPanel() {
  const { showToast } = useToast();
  const [allBudgets, setAllBudgets] = useState<BudgetWithVariance[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [period, setPeriod] = useState(currentPeriod());
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<BudgetWithVariance | null>(null);

  /** Silent after the first fetch — see the note in settings/rules-panel.tsx. */
  const load = useCallback(async () => {
    try {
      const [budgetRows, categoryRows] = await Promise.all([fetchBudgets(), fetchCategories()]);
      setAllBudgets(budgetRows);
      setCategories(categoryRows);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה בטעינת תקציבים", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const periods = useMemo(() => {
    const unique = [...new Set(allBudgets.map((row) => row.period))];
    if (!unique.includes(currentPeriod())) {
      unique.unshift(currentPeriod());
    }
    return unique.sort((a, b) => b.localeCompare(a));
  }, [allBudgets]);

  const budgets = useMemo(
    () => allBudgets.filter((row) => row.period === period),
    [allBudgets, period],
  );
  const budgetedCategoryIds = useMemo(
    () => new Set(budgets.map((row) => row.categoryId)),
    [budgets],
  );

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const parsed = Number.parseFloat(amount);
    if (!categoryId || !Number.isFinite(parsed) || parsed <= 0) {
      return;
    }
    setSaving(true);
    try {
      await createBudget({ categoryId, period, amount: parsed });
      setAmount("");
      setCategoryId("");
      await load();
      showToast("תקציב נוסף", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה בשמירה", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(budgetId: string) {
    const parsed = Number.parseFloat(editAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    setSaving(true);
    try {
      await updateBudget(budgetId, { amount: parsed });
      setEditingId(null);
      await load();
      showToast("תקציב עודכן", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה בעדכון", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteBudget(deleteTarget.id);
      setDeleteTarget(null);
      await load();
      showToast("תקציב נמחק", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "מחיקה לא נתמכת עדיין", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-card border border-border-subtle bg-surface-card p-5">
      <h2 className="font-display text-lg text-text-primary">תקציבים חודשיים</h2>
      <p className="mt-1 text-sm text-text-muted">הגדרת תקציב לפי קטגוריה</p>

      <div className="mt-4">
        <LabelledField id="budget-period" label="חודש">
          <select
            id="budget-period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="min-h-11 rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
          >
            {periods.map((row) => (
              <option key={row} value={row}>{formatMonthYear(row)}</option>
            ))}
          </select>
        </LabelledField>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-text-muted">טוען תקציבים…</p>
      ) : (
        <>
          <BudgetSuggestionsSection
            period={period}
            budgetedCategoryIds={budgetedCategoryIds}
            onActivated={load}
          />
          {budgets.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {budgets.map((budget) => {
                const isEditing = editingId === budget.id;

                return (
                  <li
                    key={budget.id}
                    className="rounded-lg bg-surface-elevated px-3 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{budget.categoryName}</span>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <input
                              type="number"
                              min="1"
                              value={editAmount}
                              onChange={(e) => setEditAmount(e.target.value)}
                              className="w-24 rounded border border-border-subtle bg-surface-bg px-2 py-1"
                            />
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void handleSaveEdit(budget.id)}
                              className="text-brand-blue-500 hover:underline"
                            >
                              שמירה
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="text-text-muted hover:underline"
                            >
                              ביטול
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-text-secondary">
                              <bdi dir="ltr">
                                {formatIls(budget.actualIls)} / {formatIls(budget.amount)}
                              </bdi>
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(budget.id);
                                setEditAmount(String(budget.amount));
                              }}
                              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-surface-card"
                              aria-label={`עריכת תקציב ${budget.categoryName}`}
                            >
                              <Pencil className="size-4 text-text-muted" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(budget)}
                              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded hover:bg-surface-card"
                              aria-label={`מחיקת תקציב ${budget.categoryName}`}
                            >
                              <Trash2 className="size-4 text-brand-orange-500" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="mt-2">
                      <BudgetProgressBar budget={budget} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-text-muted">אין תקציבים לחודש זה</p>
          )}

          <form onSubmit={(e) => void handleCreate(e)} className="mt-4 grid gap-3 sm:flex sm:flex-wrap">
            <LabelledField id="budget-category" label="קטגוריה">
              <select
                id="budget-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
              >
                <option value="" disabled>
                  {he.budgetsUx.selectCategory}
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </LabelledField>
            <LabelledField id="budget-amount" label="סכום חודשי (₪)">
              <input
                id="budget-amount"
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
              />
            </LabelledField>
            <div className="flex items-end sm:items-end">
              <button
                type="submit"
                disabled={saving}
                className="min-h-11 w-full rounded-lg bg-brand-blue-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 sm:w-auto"
              >
                {saving ? "שומר…" : "הוספת תקציב"}
              </button>
            </div>
          </form>
        </>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="מחיקת תקציב"
        message={`למחוק את התקציב של ${deleteTarget?.categoryName ?? ""}?`}
        confirmLabel="מחיקה"
        tone="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
