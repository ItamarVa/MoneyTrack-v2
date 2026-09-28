"use client";

import { HA_PASSPHRASE_MAX_LENGTH } from "@moneytrack/contracts";
import { FormEvent, useState } from "react";
import { HaFlowShell } from "@/components/ha/ha-flow-shell";
import {
  HaPassphraseChecklist,
  haPassphraseClientError,
  haPassphraseErrorMessage,
} from "@/components/ha/ha-passphrase-checklist";
import { PinPad } from "@/components/mobile/pin-pad";
import { apiUrl } from "@/lib/base-path";
import he from "@/locales/he.json";
import { useRouter } from "next/navigation";

const copy = he.haPassphrase;

const FIELD_CLASS =
  "w-full rounded-lg border border-border-strong bg-surface-bg px-4 py-3 text-base text-text-primary focus:border-brand-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-blue-500/25";

export default function HaRecoveryPage() {
  const router = useRouter();
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassphrase, setNewPassphrase] = useState("");
  const [step, setStep] = useState<"form" | "pin">("form");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function onFormSubmit(event: FormEvent) {
    event.preventDefault();
    const passphraseError = haPassphraseClientError(newPassphrase);
    if (passphraseError) {
      setError(passphraseError);
      return;
    }
    setError("");
    setStep("pin");
  }

  async function submitPin(pin: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/ha/recovery"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recoveryKey, newPassphrase, newPin: pin }),
      });
      const data = (await response.json()) as { error?: string; code?: string };
      if (!response.ok) {
        setError(haPassphraseErrorMessage(data.code) ?? data.error ?? "שחזור נכשל");
        // A wrong key or rejected passphrase can only be fixed in the form.
        setStep("form");
        return;
      }
      router.replace("/dashboard");
    } catch {
      setError("שגיאת רשת");
      setStep("pin");
    } finally {
      setLoading(false);
    }
  }

  if (step === "pin") {
    return (
      <HaFlowShell title="PIN חדש">
        <PinPad disabled={loading} error={error} onComplete={submitPin} />
      </HaFlowShell>
    );
  }

  return (
    <HaFlowShell title="שחזור עם מפתח">
      <form className="space-y-4" onSubmit={onFormSubmit}>
        <input
          type="text"
          className={FIELD_CLASS}
          placeholder="מפתח שחזור"
          required
          dir="ltr"
          value={recoveryKey}
          onChange={(event) => setRecoveryKey(event.target.value)}
        />
        <label className="block text-sm font-medium">
          {copy.newLabel}
          <input
            type="password"
            className={`${FIELD_CLASS} mt-1`}
            maxLength={HA_PASSPHRASE_MAX_LENGTH}
            autoComplete="new-password"
            aria-describedby="ha-passphrase-rules"
            required
            value={newPassphrase}
            onChange={(event) => setNewPassphrase(event.target.value)}
          />
        </label>
        <HaPassphraseChecklist id="ha-passphrase-rules" passphrase={newPassphrase} />
        {error ? (
          <p role="alert" aria-live="assertive" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-lg bg-brand-blue-500 py-3 font-semibold text-white dark:bg-brand-orange-400"
        >
          המשך לבחירת PIN
        </button>
      </form>
    </HaFlowShell>
  );
}
