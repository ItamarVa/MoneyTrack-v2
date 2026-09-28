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

export default function HaEnrollPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "pin" | "recovery">("form");
  const [passphrase, setPassphrase] = useState("");
  const [ack, setAck] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function onFormSubmit(event: FormEvent) {
    event.preventDefault();
    const passphraseError = haPassphraseClientError(passphrase);
    if (passphraseError) {
      setError(passphraseError);
      return;
    }
    if (!ack) {
      setError("יש לאשר שמירת מפתח השחזור");
      return;
    }
    setError("");
    setStep("pin");
  }

  async function submitEnrollment(completedPin: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/ha/enroll"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          passphrase,
          pin: completedPin,
          recoveryKeyAcknowledged: true,
        }),
      });
      const data = (await response.json()) as { recoveryKey?: string; error?: string; code?: string };
      if (!response.ok) {
        setError(haPassphraseErrorMessage(data.code) ?? data.error ?? "ההרשמה נכשלה");
        // Most refusals concern the passphrase, which only the form can change.
        setStep("form");
        return;
      }
      if (data.recoveryKey && !data.recoveryKey.includes("unchanged")) {
        setRecoveryKey(data.recoveryKey);
        setStep("recovery");
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

  if (step === "recovery") {
    return (
      <HaFlowShell title="שמרו מפתח השחזור">
        <p className="mb-4 text-sm text-text-secondary">
          העתיקו את המפתח לכספת סיסמאות. הוא יוצג פעם אחת בלבד.
        </p>
        <pre className="mb-6 overflow-x-auto rounded-lg bg-surface-elevated p-4 text-sm" dir="ltr">
          {recoveryKey}
        </pre>
        <button
          type="button"
          className="w-full rounded-lg bg-brand-blue-500 py-3 font-semibold text-white dark:bg-brand-orange-400"
          onClick={() => router.replace("/dashboard")}
        >
          המשך לאפליקציה
        </button>
      </HaFlowShell>
    );
  }

  if (step === "pin") {
    return (
      <HaFlowShell title="בחירת קוד PIN">
        <PinPad disabled={loading} error={error} onComplete={submitEnrollment} />
      </HaFlowShell>
    );
  }

  return (
    <HaFlowShell title="הגדרה ראשונית">
      <form className="space-y-4" onSubmit={onFormSubmit}>
        <label className="block text-sm font-medium">
          {copy.label}
          <input
            type="password"
            className={`${FIELD_CLASS} mt-1`}
            maxLength={HA_PASSPHRASE_MAX_LENGTH}
            autoComplete="new-password"
            aria-describedby="ha-passphrase-helper ha-passphrase-rules"
            required
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
          />
        </label>
        <p id="ha-passphrase-helper" className="text-sm text-text-secondary">
          {copy.enrollHelper}
        </p>
        <HaPassphraseChecklist id="ha-passphrase-rules" passphrase={passphrase} />
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={ack}
            onChange={(event) => setAck(event.target.checked)}
          />
          <span>{copy.recoveryKeyAck}</span>
        </label>
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
