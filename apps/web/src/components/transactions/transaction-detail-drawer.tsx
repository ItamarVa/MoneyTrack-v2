"use client";

/**
 * Side drawer for a single transaction: note, tags, exclude-from-totals,
 * splits, manual links, and revision history.
 */
import type {
  Category,
  Tag,
  Transaction,
  TransactionLinkType,
} from "@moneytrack/contracts";
import { useEffect, useMemo, useState } from "react";
import { CategoryPicker } from "@/components/transactions/category-picker";
import { MerchantRuleBlock } from "@/components/transactions/merchant-rule-block";
import { TransactionTagChips } from "@/components/transactions/transaction-tag-chips";
import {
  fetchTransactionDetail,
  linkTransactions,
  splitTransaction,
  updateTransaction,
  type TransactionDetailFull,
} from "@/components/transactions/transaction-api";
import { useToast } from "@/components/ui/toast";
import { fetchCategories, updateTransaction as patchTransaction } from "@/lib/api-client";
import { formatIlsExact } from "@/lib/currency";
import { formatMonthYear } from "@/lib/dates";
import { shiftPeriod } from "@/components/entity/entity-dimension";
import {
  amountToneClass,
  formatTransactionAmountDisplay,
} from "@/lib/transaction-amounts";

type TransactionDetailDrawerProps = {
  open: boolean;
  transactionId: string | null;
  tags: Tag[];
  /** When omitted, categories are fetched once per open (legacy callers). */
  categories?: Category[];
  onClose: () => void;
  onChanged: () => void;
  /** When set, category changes patch the list row instead of a full reload. */
  onRowChanged?: (updated: Transaction) => void;
};

type SplitDraft = { categoryId: string; amount: string; note: string };

const LINK_LABELS: Record<TransactionLinkType, string> = {
  internal_transfer: "העברה פנימית",
  card_settlement: "סגירת כרטיס",
  refund_of: "זיכוי",
  duplicate_of: "כפילות",
};

function formatHebrewDate(isoDate: string): string {
  const parts = isoDate.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  return new Intl.DateTimeFormat("he-IL").format(new Date(year, month - 1, day));
}

function formatRevisionTime(iso: string): string {
  return new Intl.DateTimeFormat("he-IL", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function TransactionDetailDrawer({
  open,
  transactionId,
  tags,
  categories: categoriesProp,
  onClose,
  onChanged,
  onRowChanged,
}: TransactionDetailDrawerProps) {
  const { showToast } = useToast();
  const [detail, setDetail] = useState<TransactionDetailFull | null>(null);
  const [fetchedCategories, setFetchedCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [userNote, setUserNote] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [excludedFromTotals, setExcludedFromTotals] = useState(false);
  const [exclusionReason, setExclusionReason] = useState("");

  const [splitDrafts, setSplitDrafts] = useState<SplitDraft[]>([]);
  const [linkToId, setLinkToId] = useState("");
  const [linkType, setLinkType] = useState<TransactionLinkType>("refund_of");
  const [reportingPeriod, setReportingPeriod] = useState("");
  const [reportingPeriodLocked, setReportingPeriodLocked] = useState(false);

  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const categories = categoriesProp ?? fetchedCategories;
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  useEffect(() => {
    if (!open || !transactionId) {
      setDetail(null);
      return;
    }

    setLoading(true);
    const detailPromise = fetchTransactionDetail(transactionId);
    const categoriesPromise = categoriesProp ? Promise.resolve(null) : fetchCategories();
    void Promise.all([detailPromise, categoriesPromise])
      .then(([detailRow, categoryRows]) => {
        setDetail(detailRow);
        if (categoryRows) {
          setFetchedCategories(categoryRows);
        }
        setUserNote(detailRow.transaction.userNote ?? "");
        setSelectedTagIds(detailRow.tags);
        setExcludedFromTotals(detailRow.transaction.excludedFromTotals);
        setExclusionReason(detailRow.transaction.exclusionReason ?? "");
        setReportingPeriod(detailRow.transaction.reportingPeriod ?? "");
        setReportingPeriodLocked(detailRow.transaction.reportingPeriodLocked);
        if (detailRow.splits.length > 0) {
          setSplitDrafts(
            detailRow.splits.map((split) => ({
              categoryId: split.categoryId,
              amount: String(split.amount),
              note: split.note ?? "",
            })),
          );
        } else {
          setSplitDrafts([
            {
              categoryId: detailRow.categoryId ?? "",
              amount: String(Math.abs(detailRow.transaction.amountIls)),
              note: "",
            },
          ]);
        }
      })
      .catch((error) => {
        showToast(error instanceof Error ? error.message : "שגיאה בטעינה", "error");
      })
      .finally(() => setLoading(false));
  }, [open, transactionId, categoriesProp, showToast]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const transaction = detail?.transaction;

  async function handleSaveMeta(): Promise<void> {
    if (!transactionId) return;
    setSaving(true);
    try {
      const updated = await updateTransaction(transactionId, {
        userNote: userNote.trim() ? userNote.trim() : null,
        excludedFromTotals,
        exclusionReason: excludedFromTotals ? exclusionReason.trim() || null : null,
        tagIds: selectedTagIds,
      });
      setDetail(updated);
      showToast("העסקה עודכנה", "success");
      onChanged();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה בשמירה", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSplits(): Promise<void> {
    if (!transactionId || !transaction) return;
    const splits = splitDrafts
      .filter((row) => row.categoryId && row.amount)
      .map((row) => ({
        categoryId: row.categoryId,
        amount: Number(row.amount),
        note: row.note.trim() ? row.note.trim() : null,
      }));
    if (splits.length === 0) {
      showToast("נא להוסיף לפחות פיצול אחד", "error");
      return;
    }
    setSaving(true);
    try {
      const updated = await splitTransaction(transactionId, { splits });
      setDetail(updated);
      showToast("הפיצול נשמר", "success");
      onChanged();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה בפיצול", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveReportingPeriod(period: string): Promise<void> {
    if (!transactionId) return;
    setSaving(true);
    try {
      const updatedTxn = await patchTransaction(transactionId, {
        reportingPeriod: period,
        reportingPeriodLocked: true,
      });
      setDetail((current) =>
        current ? { ...current, transaction: updatedTxn } : current,
      );
      setReportingPeriod(updatedTxn.reportingPeriod ?? period);
      setReportingPeriodLocked(true);
      showToast("חודש הצגה עודכן", "success");
      onChanged();
      if (onRowChanged) onRowChanged(updatedTxn);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה בשמירה", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleResetReportingPeriod(): Promise<void> {
    if (!transactionId) return;
    setSaving(true);
    try {
      const updatedTxn = await patchTransaction(transactionId, {
        reportingPeriod: null,
        reportingPeriodLocked: false,
      });
      setDetail((current) =>
        current ? { ...current, transaction: updatedTxn } : current,
      );
      setReportingPeriod(updatedTxn.reportingPeriod ?? "");
      setReportingPeriodLocked(false);
      showToast("חזרה לכלל אוטומטי", "success");
      onChanged();
      if (onRowChanged) onRowChanged(updatedTxn);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה באיפוס", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddLink(): Promise<void> {
    if (!transactionId || !linkToId.trim()) return;
    setSaving(true);
    try {
      await linkTransactions(transactionId, {
        toId: linkToId.trim(),
        linkType,
      });
      const refreshed = await fetchTransactionDetail(transactionId);
      setDetail(refreshed);
      setLinkToId("");
      showToast("הקישור נוצר", "success");
      onChanged();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה בקישור", "error");
    } finally {
      setSaving(false);
    }
  }

  function toggleTag(tagId: string): void {
    setSelectedTagIds((current) =>
      current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId],
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-brand-navy-900/40">
      <button
        type="button"
        aria-label="סגור פרטי עסקה"
        className="absolute inset-0"
        onClick={onClose}
      />
      <aside
        className="relative z-10 flex h-full w-full max-w-full flex-col border-s border-border-subtle bg-surface-card shadow-soft md:max-w-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-detail-title"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div className="min-w-0">
            <h2 id="tx-detail-title" className="font-display text-xl text-text-primary">
              פרטי עסקה
            </h2>
            {transaction ? (
              <p className="mt-1 truncate text-sm text-text-secondary">
                {transaction.descriptionRaw}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-sm text-text-muted hover:bg-surface-elevated"
          >
            סגור
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-text-muted">טוען…</p>
          ) : !transaction ? (
            <p className="text-sm text-text-muted">לא נמצאה עסקה</p>
          ) : (
            <div className="space-y-6">
              <section className="space-y-2">
                <div className="flex flex-wrap items-start gap-3 text-sm">
                  <span className="text-text-secondary">
                    {formatHebrewDate(transaction.transactionDate)}
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    {(() => {
                      const display = formatTransactionAmountDisplay(transaction) as ReturnType<
                        typeof formatTransactionAmountDisplay
                      > & { secondary?: string };
                      return (
                        <>
                          <bdi
                            dir="ltr"
                            className={[
                              "block font-semibold tabular-nums",
                              amountToneClass(display.tone),
                            ].join(" ")}
                          >
                            {display.text}
                          </bdi>
                          {display.secondary ? (
                            <p className="text-xs text-text-muted">
                              <bdi dir="ltr">{display.secondary}</bdi>
                            </p>
                          ) : null}
                          {transaction.chargeDate !== transaction.transactionDate ? (
                            <p className="text-xs text-text-muted">
                              חיוב: {formatHebrewDate(transaction.chargeDate)}
                            </p>
                          ) : null}
                        </>
                      );
                    })()}
                  </div>
                  {transaction.excludedFromTotals ? (
                    <span className="rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] text-text-muted">
                      מוחרג מסיכומים
                    </span>
                  ) : null}
                </div>
                <CategoryPicker
                  transactionId={transaction.id}
                  value={transaction.categoryId}
                  classificationSource={transaction.classificationSource}
                  categories={categories}
                  onChanged={(updated) => {
                    setDetail((current) =>
                      current
                        ? {
                            ...current,
                            transaction: updated,
                            categoryId: updated.categoryId,
                          }
                        : current,
                    );
                    if (onRowChanged) {
                      onRowChanged(updated);
                    } else {
                      onChanged();
                    }
                  }}
                />
                <MerchantRuleBlock transaction={transaction} onApplied={onChanged} />
                <TransactionTagChips tagIds={selectedTagIds} tagsById={tagsById} />
              </section>

              {transaction.kind === "income" ? (
                <section className="space-y-3 rounded-lg border border-border-subtle bg-surface-elevated/40 p-4">
                  <h3 className="text-sm font-semibold text-text-primary">חודש הצגה</h3>
                  <p className="text-xs text-text-muted">
                    תאריך חיוב: {formatHebrewDate(transaction.chargeDate)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-label="חודש קודם"
                      disabled={saving || !reportingPeriod}
                      onClick={() => {
                        const next = shiftPeriod(reportingPeriod, -1);
                        setReportingPeriod(next);
                        void handleSaveReportingPeriod(next);
                      }}
                      className="rounded border border-border-subtle px-2 py-1 text-sm hover:border-brand-blue-500/40 disabled:opacity-50"
                    >
                      ‹
                    </button>
                    <input
                      type="month"
                      value={reportingPeriod}
                      disabled={saving}
                      onChange={(event) => {
                        const next = event.target.value;
                        setReportingPeriod(next);
                        if (next) void handleSaveReportingPeriod(next);
                      }}
                      className="min-h-10 rounded-lg border border-border-subtle bg-surface-card px-3 text-sm"
                      aria-label="חודש הצגה"
                    />
                    <button
                      type="button"
                      aria-label="חודש הבא"
                      disabled={saving || !reportingPeriod}
                      onClick={() => {
                        const next = shiftPeriod(reportingPeriod, 1);
                        setReportingPeriod(next);
                        void handleSaveReportingPeriod(next);
                      }}
                      className="rounded border border-border-subtle px-2 py-1 text-sm hover:border-brand-blue-500/40 disabled:opacity-50"
                    >
                      ›
                    </button>
                  </div>
                  {reportingPeriod ? (
                    <p className="text-xs text-text-secondary">
                      {formatMonthYear(reportingPeriod)}
                      {reportingPeriodLocked ? " · חריג ידני" : " · לפי כלל אוטומטי"}
                    </p>
                  ) : null}
                  {reportingPeriodLocked ? (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleResetReportingPeriod()}
                      className="text-xs font-medium text-brand-blue-500 disabled:opacity-50"
                    >
                      חזרה לכלל אוטומטי
                    </button>
                  ) : null}
                </section>
              ) : null}

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-text-primary">הערה</h3>
                <textarea
                  value={userNote}
                  onChange={(event) => setUserNote(event.target.value)}
                  rows={3}
                  maxLength={2000}
                  className="w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-sm"
                  placeholder="הערה אישית לעסקה"
                />
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-text-primary">תגיות</h3>
                {tags.length === 0 ? (
                  <p className="text-xs text-text-muted">אין תגיות. צרו תגיות בהגדרות.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => {
                      const active = selectedTagIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          className={[
                            "rounded-full px-3 py-1 text-xs font-medium transition",
                            active
                              ? "bg-brand-blue-500 text-white"
                              : "bg-surface-elevated text-text-secondary hover:bg-surface-bg",
                          ].join(" ")}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="space-y-3 rounded-lg border border-border-subtle bg-surface-elevated/40 p-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <input
                    type="checkbox"
                    checked={excludedFromTotals}
                    onChange={(event) => setExcludedFromTotals(event.target.checked)}
                  />
                  החרג מסיכומים ותרשימים
                </label>
                {excludedFromTotals ? (
                  <input
                    type="text"
                    value={exclusionReason}
                    onChange={(event) => setExclusionReason(event.target.value)}
                    placeholder="סיבת החרגה (אופציונלי)"
                    className="w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm"
                  />
                ) : null}
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-text-primary">פיצול לקטגוריות</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setSplitDrafts((rows) => [
                        ...rows,
                        { categoryId: "", amount: "", note: "" },
                      ])
                    }
                    className="text-xs font-medium text-brand-blue-500"
                  >
                    + שורה
                  </button>
                </div>
                <div className="space-y-2">
                  {splitDrafts.map((row, index) => (
                    <div key={index} className="grid gap-2 rounded-lg border border-border-subtle p-3">
                      <select
                        value={row.categoryId}
                        onChange={(event) =>
                          setSplitDrafts((rows) =>
                            rows.map((item, rowIndex) =>
                              rowIndex === index
                                ? { ...item, categoryId: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="w-full rounded-md border border-border-subtle bg-surface-card px-2 py-1.5 text-xs"
                      >
                        <option value="">קטגוריה</option>
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
                        value={row.amount}
                        onChange={(event) =>
                          setSplitDrafts((rows) =>
                            rows.map((item, rowIndex) =>
                              rowIndex === index ? { ...item, amount: event.target.value } : item,
                            ),
                          )
                        }
                        placeholder="סכום"
                        dir="ltr"
                        className="w-full rounded-md border border-border-subtle bg-surface-card px-2 py-1.5 text-xs"
                      />
                      <input
                        type="text"
                        value={row.note}
                        onChange={(event) =>
                          setSplitDrafts((rows) =>
                            rows.map((item, rowIndex) =>
                              rowIndex === index ? { ...item, note: event.target.value } : item,
                            ),
                          )
                        }
                        placeholder="הערה לפיצול"
                        className="w-full rounded-md border border-border-subtle bg-surface-card px-2 py-1.5 text-xs"
                      />
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveSplits()}
                  className="min-h-10 rounded-lg border border-border-subtle px-4 text-sm font-medium hover:bg-surface-elevated disabled:opacity-50"
                >
                  שמור פיצול
                </button>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-text-primary">קישורים</h3>
                {detail?.links.length ? (
                  <ul className="space-y-2 text-xs text-text-secondary">
                    {detail.links.map((link) => {
                      const otherId = link.fromId === transaction.id ? link.toId : link.fromId;
                      return (
                        <li key={link.id} className="rounded-lg bg-surface-elevated px-3 py-2">
                          <span className="font-medium text-text-primary">
                            {LINK_LABELS[link.linkType as TransactionLinkType] ?? link.linkType}
                          </span>
                          {" · "}
                          <span className="font-mono text-[10px]" dir="ltr">{otherId.slice(0, 8)}…</span>
                          {link.source === "manual" ? " · ידני" : " · אוטומטי"}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-text-muted">אין קישורים</p>
                )}
                <div className="grid gap-2">
                  <input
                    type="text"
                    value={linkToId}
                    onChange={(event) => setLinkToId(event.target.value)}
                    placeholder="מזהה עסקה לקישור"
                    dir="ltr"
                    className="w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-xs font-mono"
                  />
                  <select
                    value={linkType}
                    onChange={(event) => setLinkType(event.target.value as TransactionLinkType)}
                    className="w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-sm"
                  >
                    {Object.entries(LINK_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={saving || !linkToId.trim()}
                    onClick={() => void handleAddLink()}
                    className="min-h-10 rounded-lg bg-brand-blue-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    קשר עסקה
                  </button>
                </div>
              </section>

              {detail?.splits.length ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-text-primary">פיצולים שמורים</h3>
                  <ul className="space-y-1 text-xs text-text-secondary">
                    {detail.splits.map((split) => (
                      <li key={split.id}>
                        {categoriesById.get(split.categoryId)?.name ?? "קטגוריה"} ·{" "}
                        <bdi dir="ltr">{formatIlsExact(split.amount)}</bdi>
                        {split.note ? ` · ${split.note}` : ""}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {detail?.revisions.length ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-text-primary">היסטוריית שינויים</h3>
                  <ol className="space-y-2 text-xs text-text-secondary">
                    {detail.revisions.map((revision) => (
                      <li key={revision.id} className="rounded-lg bg-surface-elevated px-3 py-2">
                        <span className="font-medium text-text-primary">{revision.fieldName}</span>
                        {" · "}
                        {formatRevisionTime(revision.revisedAt)}
                        <div className="mt-1 font-mono text-[10px]" dir="ltr">
                          {revision.oldValue ?? "—"} → {revision.newValue ?? "—"}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </div>
          )}
        </div>

        {transaction ? (
          <footer className="border-t border-border-subtle px-5 py-4">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSaveMeta()}
              className="min-h-11 w-full rounded-lg bg-brand-orange-500 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "שומר…" : "שמור הערה, תגיות והחרגה"}
            </button>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}
