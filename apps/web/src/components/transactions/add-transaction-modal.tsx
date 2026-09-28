"use client";

import type { Account, TransactionCreateRequest } from "@moneytrack/contracts";
import { useEffect, useState } from "react";
import { createTransaction } from "@/lib/api-client";

type AddTransactionModalProps = {
  open: boolean;
  accounts: Account[];
  onClose: () => void;
  onCreated: () => void;
};

const manualLabels: Record<string, string> = {
  bit: "ביט",
  paybox: "פייבוקס",
  cash: "מזומן",
};

export function AddTransactionModal({
  open,
  accounts,
  onClose,
  onCreated,
}: AddTransactionModalProps) {
  const manualAccounts = accounts.filter((a) => a.kind === "cash");
  const [accountId, setAccountId] = useState(manualAccounts[0]?.id ?? "");
  const [transactionDate, setTransactionDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [direction, setDirection] = useState<"debit" | "credit">("debit");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [userNote, setUserNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (manualAccounts.length > 0) {
      setAccountId(manualAccounts[0]!.id);
    }
  }, [open, manualAccounts, accountId]);

  if (!open) return null;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const parsedAmount = Number(amount);
    if (!accountId || !description.trim() || !parsedAmount || parsedAmount <= 0) {
      setError("נא למלא חשבון, תיאור וסכום חיובי");
      return;
    }

    setSaving(true);
    try {
      const body: TransactionCreateRequest = {
        accountId,
        transactionDate,
        amount: parsedAmount,
        direction,
        description: description.trim(),
        userNote: userNote.trim() ? userNote.trim() : null,
      };
      await createTransaction(body);
      onCreated();
      onClose();
      setAmount("");
      setDescription("");
      setUserNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-brand-navy-900/55 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-tx-title"
    >
      <div className="w-full max-w-lg rounded-card border border-border-subtle bg-surface-card shadow-soft">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 id="add-tx-title" className="font-display text-xl text-text-primary">
            הוספת עסקה ידנית
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            ביט, פייבוקס או מזומן — ללא סנכרון בנק
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {manualAccounts.length === 0 ? (
            <p className="rounded-lg border border-border-subtle bg-surface-bg px-4 py-3 text-sm text-text-secondary">
              אין חשבון מזומן/ביט/פייבוקס. הוסיפו בדף חשבונות תחילה.
            </p>
          ) : null}

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-text-primary">חשבון</span>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-surface-bg px-3 py-2.5 text-sm"
              required
            >
              {manualAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.displayName} (
                  {manualLabels[account.institutionCode] ?? account.institutionCode})
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text-primary">תאריך</span>
              <input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full rounded-lg border border-border-subtle bg-surface-bg px-3 py-2.5 text-sm"
                dir="ltr"
                required
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text-primary">סוג</span>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as "debit" | "credit")}
                className="w-full rounded-lg border border-border-subtle bg-surface-bg px-3 py-2.5 text-sm"
              >
                <option value="debit">הוצאה</option>
                <option value="credit">הכנסה</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-text-primary">סכום (₪)</span>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-surface-bg px-3 py-2.5 text-sm"
              dir="ltr"
              placeholder="0.00"
              required
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-text-primary">תיאור</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-surface-bg px-3 py-2.5 text-sm"
              maxLength={500}
              required
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-text-primary">הערה (אופציונלי)</span>
            <textarea
              value={userNote}
              onChange={(e) => setUserNote(e.target.value)}
              className="w-full rounded-lg border border-border-subtle bg-surface-bg px-3 py-2.5 text-sm"
              rows={2}
              maxLength={2000}
            />
          </label>

          {error ? (
            <p className="rounded-lg bg-brand-orange-500/10 px-3 py-2 text-sm text-brand-orange-500">
              {error}
            </p>
          ) : null}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 flex-1 rounded-lg border border-border-subtle px-4 text-sm font-medium text-text-secondary"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving || manualAccounts.length === 0}
              className="min-h-11 flex-1 rounded-lg bg-brand-orange-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-orange-400 disabled:opacity-50"
            >
              {saving ? "שומר…" : "שמירה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
