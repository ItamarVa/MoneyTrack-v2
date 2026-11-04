"use client";

/**
 * Full account creation form — owned by Track E (account kinds and notes).
 * Collapsed behind a secondary button (phone-first: the page is mostly status, adding is rare);
 * the Bit/Paybox/cash quick-add buttons live inside it.
 * Covers every AccountKind with display name, optional last-4, currency and note.
 * Cash rows use bit/paybox/cash institution codes; all other kinds use "manual".
 */
import type { AccountCreateRequest, AccountKind } from "@moneytrack/contracts";
import { CreditCard, Smartphone, Wallet } from "lucide-react";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { LabelledField } from "@/components/ui/labelled-field";
import { createAccount } from "@/lib/api-client";
import he from "@/locales/he.json";

type AddAccountFormProps = {
  onCreated?: () => void;
  /** Institution codes of existing manual accounts (quick-add buttons for them are disabled). */
  existingManualCodes: readonly string[];
  onQuickAdd: (code: string, label: string) => void;
};

const quickAddTypes = [
  { code: "bit", label: "ביט", icon: Smartphone },
  { code: "paybox", label: "פייבוקס", icon: CreditCard },
  { code: "cash", label: "מזומן", icon: Wallet },
] as const;

const kindOptions: { value: AccountKind; label: string }[] = [
  { value: "bank", label: "בנק" },
  { value: "credit_card", label: "כרטיס אשראי" },
  { value: "savings", label: "חיסכון" },
  { value: "investment", label: "השקעות" },
  { value: "loan", label: "הלוואה" },
  { value: "cash", label: "מזומן" },
];

const cashInstitutionOptions = [
  { value: "bit", label: "ביט" },
  { value: "paybox", label: "פייבוקס" },
  { value: "cash", label: "מזומן" },
] as const;

const currencyOptions = [
  { value: "ILS", label: "שקל (ILS)" },
  { value: "USD", label: "דולר (USD)" },
  { value: "EUR", label: "אירו (EUR)" },
];

const inputClass =
  "w-full rounded-lg border border-border-subtle bg-surface-bg px-3 py-2.5 text-sm text-text-primary";

export function AddAccountForm({ onCreated, existingManualCodes, onQuickAdd }: AddAccountFormProps) {
  const [expanded, setExpanded] = useState(false);
  const [kind, setKind] = useState<AccountKind>("bank");
  const [cashInstitution, setCashInstitution] = useState<"bit" | "paybox" | "cash">("cash");
  const [displayName, setDisplayName] = useState("");
  const [numberLast4, setNumberLast4] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function resetForm() {
    setDisplayName("");
    setNumberLast4("");
    setCurrency("ILS");
    setNote("");
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError("נא למלא שם חשבון");
      return;
    }

    const trimmedLast4 = numberLast4.trim();
    if (trimmedLast4 && trimmedLast4.length !== 4) {
      setError("4 ספרות אחרונות חייבות להיות בדיוק 4 תווים");
      return;
    }

    const trimmedNote = note.trim();
    const institutionCode = kind === "cash" ? cashInstitution : "manual";

    const body: AccountCreateRequest = {
      kind,
      institutionCode,
      displayName: trimmedName,
      currency,
      numberLast4: trimmedLast4 ? trimmedLast4 : null,
      note: trimmedNote ? trimmedNote : null,
    };

    setSaving(true);
    try {
      await createAccount(body);
      resetForm();
      setExpanded(false);
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה ביצירת חשבון");
    } finally {
      setSaving(false);
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        aria-expanded={false}
        aria-controls="add-account-panel"
        onClick={() => setExpanded(true)}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border-subtle bg-surface-card px-5 text-sm font-medium transition hover:bg-surface-elevated sm:w-auto"
      >
        {he.accountsUx.manual.add}
      </button>
    );
  }

  return (
    <section
      id="add-account-panel"
      className="rounded-card border border-border-subtle bg-surface-card px-4 py-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-text-primary">{he.accountsUx.manual.add}</h2>
          <p className="mt-1 text-sm text-text-secondary">
            בנק, כרטיס, חיסכון, השקעות, הלוואה או מזומן — ללא סנכרון אוטומטי
          </p>
        </div>
        <button
          type="button"
          aria-expanded
          aria-controls="add-account-panel"
          onClick={() => setExpanded(false)}
          className="min-h-11 shrink-0 rounded-lg border border-border-subtle px-3 text-sm font-medium hover:bg-surface-elevated"
        >
          {he.accountsUx.manual.close}
        </button>
      </div>

      <div className="mt-4">
        <p className="text-xs text-text-muted">{he.accountsUx.manual.quickAddTitle}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {quickAddTypes.map((type) => {
            const exists = existingManualCodes.includes(type.code);
            return (
              <button
                key={type.code}
                type="button"
                disabled={exists}
                onClick={() => onQuickAdd(type.code, type.label)}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-subtle bg-surface-bg px-4 text-sm font-medium transition hover:bg-surface-elevated disabled:opacity-40"
              >
                <Icon icon={type.icon} size={16} />
                {type.label}
                {exists ? " ✓" : ""}
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <LabelledField id="account-kind" label="סוג חשבון">
          <select
            id="account-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as AccountKind)}
            className={inputClass}
          >
            {kindOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </LabelledField>

        {kind === "cash" ? (
          <LabelledField id="cash-institution" label="סוג מזומן">
            <select
              id="cash-institution"
              value={cashInstitution}
              onChange={(e) =>
                setCashInstitution(e.target.value as "bit" | "paybox" | "cash")
              }
              className={inputClass}
            >
              {cashInstitutionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </LabelledField>
        ) : null}

        <LabelledField id="account-name" label="שם חשבון">
          <input
            id="account-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={inputClass}
            required
            autoComplete="off"
          />
        </LabelledField>

        <LabelledField
          id="account-last4"
          label="4 ספרות אחרונות"
          hint="אופציונלי — מספר חשבון או כרטיס"
        >
          <input
            id="account-last4"
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={numberLast4}
            onChange={(e) => setNumberLast4(e.target.value.replace(/\D/g, ""))}
            className={inputClass}
            autoComplete="off"
          />
        </LabelledField>

        <LabelledField id="account-currency" label="מטבע">
          <select
            id="account-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={inputClass}
          >
            {currencyOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </LabelledField>

        <LabelledField id="account-note" label="הערה" hint="אופציונלי">
          <textarea
            id="account-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className={`${inputClass} resize-y`}
          />
        </LabelledField>

        {error ? (
          <p className="rounded-lg border border-border-subtle bg-surface-bg px-4 py-3 text-sm text-brand-orange-500">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-navy-700 px-5 text-sm font-medium text-white transition hover:bg-brand-navy-600 disabled:opacity-50"
        >
          {saving ? "שומר..." : "הוספת חשבון"}
        </button>
      </form>
    </section>
  );
}
