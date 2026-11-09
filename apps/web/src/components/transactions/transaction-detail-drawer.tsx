"use client";

/**
 * Side drawer for a single transaction. Top to bottom: summary, category (saves on pick), note /
 * tags / exclude (saved together by the sticky footer), collapsible splits and related-transaction
 * links, saved splits and revision history. Unsaved note/tag/exclude/split edits are tracked so
 * closing asks for confirmation.
 */
import type { Category, Tag, Transaction, TransactionLinkType } from "@moneytrack/contracts";
import { useEffect, useMemo, useState } from "react";
import { CardSettlementLock, isCardSettlement } from "@/components/bank/card-settlement-lock";
import { CategoryPicker } from "@/components/transactions/category-picker";
import { DrawerLinkSection } from "@/components/transactions/drawer-link-section";
import { DrawerMetaFields } from "@/components/transactions/drawer-meta-fields";
import { DrawerReportingPeriod } from "@/components/transactions/drawer-reporting-period";
import { DrawerSplitSection } from "@/components/transactions/drawer-split-section";
import { MerchantRuleBlock } from "@/components/transactions/merchant-rule-block";
import { TransactionTagChips } from "@/components/transactions/transaction-tag-chips";
import {
  isMetaDirty,
  isSingleFullSplit,
  isSplitDirty,
  pickCategories,
  type MetaState,
  type SplitRow,
} from "@/components/transactions/transaction-drawer-helpers";
import {
  fetchTransactionDetail,
  linkTransactions,
  splitTransaction,
  updateTransaction,
  type TransactionDetailFull,
} from "@/components/transactions/transaction-api";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { fetchCategories, updateTransaction as patchTransaction } from "@/lib/api-client";
import { formatIlsExact } from "@/lib/currency";
import he from "@/locales/he.json";
import { formatMoneyInput, resolveMoneyInput } from "./transaction-money-input";
import { amountToneClass, formatTransactionAmountDisplay } from "@/lib/transaction-amounts";

type TransactionDetailDrawerProps = {
  open: boolean;
  transactionId: string | null;
  tags: Tag[];
  /** Page-level list, used only until the drawer's own fresh fetch arrives. */
  categories?: Category[];
  onClose: () => void;
  onChanged: () => void;
  /** When set, category changes patch the list row instead of a full reload. */
  onRowChanged?: (updated: Transaction) => void;
};

const copy = he.transactionDrawer;
const EMPTY_META: MetaState = { note: "", tagIds: [], excluded: false, reason: "" };

function metaFromDetail(detail: TransactionDetailFull): MetaState {
  return {
    note: detail.transaction.userNote ?? "",
    tagIds: detail.tags,
    excluded: detail.transaction.excludedFromTotals,
    reason: detail.transaction.exclusionReason ?? "",
  };
}

/** `original` keeps the stored number while `amount` shows it with two decimals. */
function splitRowsFromDetail(detail: TransactionDetailFull): SplitRow[] {
  if (detail.splits.length > 0) {
    return detail.splits.map((split) => ({
      categoryId: split.categoryId,
      amount: formatMoneyInput(split.amount),
      original: split.amount,
      note: split.note ?? "",
    }));
  }
  const whole = Math.abs(detail.transaction.amountIls);
  return [
    {
      categoryId: detail.categoryId ?? "",
      amount: formatMoneyInput(whole),
      original: whole,
      note: "",
    },
  ];
}

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
  const [fetchedCategories, setFetchedCategories] = useState<Category[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [offerVisible, setOfferVisible] = useState(false);

  const [meta, setMeta] = useState<MetaState>(EMPTY_META);
  const [metaBaseline, setMetaBaseline] = useState<MetaState>(EMPTY_META);
  const [splitDrafts, setSplitDrafts] = useState<SplitRow[]>([]);
  const [splitBaseline, setSplitBaseline] = useState<SplitRow[]>([]);
  const [reportingPeriod, setReportingPeriod] = useState("");
  const [reportingPeriodLocked, setReportingPeriodLocked] = useState(false);

  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const categories = pickCategories(fetchedCategories, categoriesProp);
  const categoriesById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const metaDirty = isMetaDirty(meta, metaBaseline);
  const splitDirty = isSplitDirty(splitDrafts, splitBaseline);
  const dirty = metaDirty || splitDirty;

  // Categories are refetched on every open so ones created after the page loaded show up.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchCategories()
      .then((rows) => {
        if (!cancelled) setFetchedCategories(rows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !transactionId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    void fetchTransactionDetail(transactionId)
      .then((row) => {
        const rows = splitRowsFromDetail(row);
        const nextMeta = metaFromDetail(row);
        setDetail(row);
        setMeta(nextMeta);
        setMetaBaseline(nextMeta);
        setSplitDrafts(rows);
        setSplitBaseline(rows);
        setReportingPeriod(row.transaction.reportingPeriod ?? "");
        setReportingPeriodLocked(row.transaction.reportingPeriodLocked);
      })
      .catch((error) => {
        showToast(error instanceof Error ? error.message : "שגיאה בטעינה", "error");
      })
      .finally(() => setLoading(false));
  }, [open, transactionId, showToast]);

  function requestClose(): void {
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  useEffect(() => {
    if (!open || confirmClose) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (dirty) setConfirmClose(true);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, dirty, confirmClose]);

  if (!open) return null;

  const transaction = detail?.transaction;

  async function handleSaveMeta(): Promise<void> {
    if (!transactionId) return;
    setSaving(true);
    try {
      const updated = await updateTransaction(transactionId, {
        userNote: meta.note.trim() ? meta.note.trim() : null,
        excludedFromTotals: meta.excluded,
        exclusionReason: meta.excluded ? meta.reason.trim() || null : null,
        tagIds: meta.tagIds,
      });
      const nextMeta = metaFromDetail(updated);
      setDetail(updated);
      setMeta(nextMeta);
      setMetaBaseline(nextMeta);
      showToast(copy.saved, "success");
      onChanged();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה בשמירה", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveSplits(): Promise<void> {
    if (!transactionId || !transaction) return;
    if (isSingleFullSplit(splitDrafts, transaction.amountIls)) {
      showToast(copy.splitSingleRow, "error");
      return;
    }
    const splits = splitDrafts
      .filter((row) => row.categoryId && row.amount)
      .map((row) => ({
        categoryId: row.categoryId,
        amount: resolveMoneyInput(row.amount, row.original),
        note: row.note.trim() ? row.note.trim() : null,
      }));
    if (splits.length === 0) {
      showToast(copy.splitNeedOne, "error");
      return;
    }
    setSaving(true);
    try {
      const updated = await splitTransaction(transactionId, { splits });
      const rows = splitRowsFromDetail(updated);
      setDetail(updated);
      setSplitDrafts(rows);
      setSplitBaseline(rows);
      showToast(copy.splitSaved, "success");
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
      setDetail((current) => (current ? { ...current, transaction: updatedTxn } : current));
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
      setDetail((current) => (current ? { ...current, transaction: updatedTxn } : current));
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

  async function handleAddLink(toId: string, linkType: TransactionLinkType): Promise<boolean> {
    if (!transactionId) return false;
    setSaving(true);
    try {
      await linkTransactions(transactionId, { toId, linkType });
      const refreshed = await fetchTransactionDetail(transactionId);
      setDetail((current) => (current ? { ...current, links: refreshed.links } : refreshed));
      showToast(copy.linkCreated, "success");
      onChanged();
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "שגיאה בקישור", "error");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function toggleTag(tagId: string): void {
    setMeta((current) => ({
      ...current,
      tagIds: current.tagIds.includes(tagId)
        ? current.tagIds.filter((id) => id !== tagId)
        : [...current.tagIds, tagId],
    }));
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-brand-navy-900/40">
      <button
        type="button"
        aria-label={copy.closeAria}
        className="absolute inset-0"
        onClick={requestClose}
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
              {copy.title}
            </h2>
            {transaction ? (
              <p className="mt-1 truncate text-sm text-text-secondary">
                {transaction.descriptionRaw}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="min-h-11 shrink-0 rounded-md px-3 text-sm text-text-muted hover:bg-surface-elevated"
          >
            {copy.close}
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-text-muted">{copy.loading}</p>
          ) : !transaction ? (
            <p className="text-sm text-text-muted">{copy.notFound}</p>
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
                      {he.plainUx.transactionDrawer.excludedBadge}
                    </span>
                  ) : null}
                </div>
              </section>

              <section className="space-y-2" aria-labelledby="tx-category-title">
                <h3 id="tx-category-title" className="text-sm font-semibold text-text-primary">
                  {he.drawer.category.label}
                </h3>
                {isCardSettlement(transaction) ? (
                  <CardSettlementLock />
                ) : (
                  <>
                    <CategoryPicker
                      variant="form"
                      onOfferChange={setOfferVisible}
                      transactionId={transaction.id}
                      value={transaction.categoryId}
                      classificationSource={transaction.classificationSource}
                      categories={categories}
                      onChanged={(updated) => {
                        setDetail((current) =>
                          current
                            ? { ...current, transaction: updated, categoryId: updated.categoryId }
                            : current,
                        );
                        showToast(copy.categoryChanged, "success");
                        if (onRowChanged) {
                          onRowChanged(updated);
                        } else {
                          onChanged();
                        }
                      }}
                    />
                    <MerchantRuleBlock
                      transaction={transaction}
                      onApplied={onChanged}
                      hidden={offerVisible}
                    />
                  </>
                )}
                <TransactionTagChips tagIds={meta.tagIds} tagsById={tagsById} />
              </section>

              {transaction.kind === "income" ? (
                <DrawerReportingPeriod
                  chargeDateLabel={formatHebrewDate(transaction.chargeDate)}
                  period={reportingPeriod}
                  locked={reportingPeriodLocked}
                  saving={saving}
                  onPeriodChange={setReportingPeriod}
                  onSave={(next) => void handleSaveReportingPeriod(next)}
                  onReset={() => void handleResetReportingPeriod()}
                />
              ) : null}

              <DrawerMetaFields
                note={meta.note}
                onNote={(note) => setMeta((current) => ({ ...current, note }))}
                tags={tags}
                selectedTagIds={meta.tagIds}
                onToggleTag={toggleTag}
                excluded={meta.excluded}
                onExcluded={(excluded) => setMeta((current) => ({ ...current, excluded }))}
                reason={meta.reason}
                onReason={(reason) => setMeta((current) => ({ ...current, reason }))}
              />

              <DrawerSplitSection
                rows={splitDrafts}
                categories={categories}
                totalAmount={transaction.amountIls}
                saving={saving}
                dirty={splitDirty}
                onChange={setSplitDrafts}
                onSave={() => void handleSaveSplits()}
              />

              <DrawerLinkSection
                transaction={transaction}
                links={detail?.links ?? []}
                saving={saving}
                onLink={handleAddLink}
              />

              {detail?.splits.length ? (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-text-primary">{copy.splitSavedTitle}</h3>
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
          <footer className="space-y-2 border-t border-border-subtle px-5 py-4">
            {metaDirty ? (
              <p role="status" className="text-xs text-brand-orange-500">
                {copy.dirtyHint}
              </p>
            ) : null}
            {splitDirty ? (
              <p role="status" className="text-xs text-brand-orange-500">
                {copy.splitDirtyHint}
              </p>
            ) : null}
            <button
              type="button"
              disabled={saving || !metaDirty}
              onClick={() => void handleSaveMeta()}
              className="min-h-11 w-full rounded-lg bg-brand-orange-500 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? copy.saving : copy.saveChanges}
            </button>
          </footer>
        ) : null}
      </aside>
      <ConfirmDialog
        open={confirmClose}
        title={copy.discardTitle}
        message={copy.discardMessage}
        confirmLabel={copy.discardConfirm}
        cancelLabel={copy.discardCancel}
        tone="danger"
        onConfirm={() => {
          setConfirmClose(false);
          onClose();
        }}
        onCancel={() => setConfirmClose(false)}
      />
    </div>
  );
}
