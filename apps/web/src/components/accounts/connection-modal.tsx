"use client";

/**
 * Connection form — picks an institution and collects its login fields, which
 * are the piece that was missing for any sync to work at all.
 * Two modes: creating a new connection, or replacing the secrets of an existing
 * one (needed whenever a bank password changes).
 * Secrets go straight to `PUT /api/connections/:id/credentials`; nothing here
 * keeps them in state longer than the submit, and no route ever reads them back.
 */

import type { Connection, ProviderCatalogEntry } from "@moneytrack/contracts";
import { useMemo, useState } from "react";
import { createConnection, saveConnectionCredentials } from "@/lib/api-client";
import { loginFieldCopy, providerLabel } from "@/lib/provider-labels";

type ConnectionModalProps = {
  open: boolean;
  providers: ProviderCatalogEntry[];
  /** Set to re-enter secrets for a connection that already exists. */
  existing: Connection | null;
  onClose: () => void;
  onSaved: () => void;
};

export function ConnectionModal({
  open,
  providers,
  existing,
  onClose,
  onSaved,
}: ConnectionModalProps) {
  const [providerCode, setProviderCode] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const activeCode = existing?.providerCode ?? providerCode;
  const provider = useMemo(
    () => providers.find((p) => p.code === activeCode) ?? null,
    [providers, activeCode],
  );

  const banks = providers.filter((p) => p.kind === "bank");
  const cards = providers.filter((p) => p.kind === "card");

  if (!open) return null;

  function reset() {
    setProviderCode("");
    setValues({});
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!provider) {
      setError("בחרו בנק או חברת אשראי");
      return;
    }
    const missing = provider.loginFields.filter((field) => !values[field]?.trim());
    if (missing.length > 0) {
      setError("נא למלא את כל השדות");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const fields = Object.fromEntries(
        provider.loginFields.map((field) => [field, values[field]!.trim()]),
      );
      const connectionId = existing?.id ?? (await createConnection(provider.code)).id;
      await saveConnectionCredentials(connectionId, fields);
      reset();
      onSaved();
      onClose();
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
      aria-labelledby="connection-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-card border border-border-subtle bg-surface-card shadow-soft">
        <div className="border-b border-border-subtle px-5 py-4">
          <h2 id="connection-title" className="font-display text-xl text-text-primary">
            {existing ? "עדכון פרטי התחברות" : "חיבור בנק או כרטיס אשראי"}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            הפרטים נשמרים בכספת המאובטחת של Windows על מחשב זה בלבד, ומשמשים רק
            להתחברות לאתר של הבנק כדי לשלוף את העסקאות.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {existing ? (
            <p className="text-sm font-medium text-text-primary">
              {providerLabel(existing.providerCode)}
            </p>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-text-primary">מוסד</span>
              <select
                value={providerCode}
                onChange={(event) => {
                  setProviderCode(event.target.value);
                  setValues({});
                  setError(null);
                }}
                className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-base"
                required
              >
                <option value="">בחרו…</option>
                <optgroup label="בנקים">
                  {banks.map((p) => (
                    <option key={p.code} value={p.code}>
                      {providerLabel(p.code)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="כרטיסי אשראי">
                  {cards.map((p) => (
                    <option key={p.code} value={p.code}>
                      {providerLabel(p.code)}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
          )}

          {provider?.loginFields.map((field) => {
            const copy = loginFieldCopy[field];
            return (
              <label key={field} className="block space-y-1.5">
                <span className="text-sm font-medium text-text-primary">{copy.label}</span>
                {copy.hint ? (
                  <span className="block text-xs text-text-muted">{copy.hint}</span>
                ) : null}
                <input
                  type={field === "password" ? "password" : "text"}
                  inputMode={copy.numeric ? "numeric" : undefined}
                  autoComplete={field === "password" ? "new-password" : "off"}
                  value={values[field] ?? ""}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, [field]: event.target.value }))
                  }
                  className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-base"
                  dir="ltr"
                  required
                />
              </label>
            );
          })}

          {error ? <p className="text-sm text-brand-orange-500">{error}</p> : null}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="min-h-11 min-w-11 flex-1 rounded-lg border border-border-subtle text-base"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving || !provider}
              className="min-h-11 min-w-11 flex-1 rounded-lg bg-brand-blue-500 text-base font-semibold text-white disabled:opacity-50"
            >
              {saving ? "שומר…" : "שמירה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
