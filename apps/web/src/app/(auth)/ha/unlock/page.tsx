"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { HaFlowShell } from "@/components/ha/ha-flow-shell";
import { apiUrl } from "@/lib/base-path";
import he from "@/locales/he.json";
import { useRouter } from "next/navigation";

const copy = he.haPassphrase;

const FIELD_CLASS =
  "w-full rounded-lg border border-border-strong bg-surface-bg px-4 py-3 text-base text-text-primary focus:border-brand-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-blue-500/25";

export default function HaUnlockPage() {
  const router = useRouter();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/ha/unlock"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      const data = (await response.json()) as { error?: string; code?: string };
      if (!response.ok) {
        const known = data.code ? (copy.unlockErrors as Record<string, string>)[data.code] : undefined;
        setError(known ?? data.error ?? "פתיחה נכשלה");
        return;
      }
      router.replace("/ha/pin");
    } catch {
      setError("שגיאת רשת");
    } finally {
      setLoading(false);
    }
  }

  return (
    <HaFlowShell title="פתיחת כספת אחרי הפעלה מחדש">
      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm font-medium">
          {copy.label}
          <input
            type="password"
            className={`${FIELD_CLASS} mt-1`}
            minLength={8}
            autoComplete="current-password"
            aria-describedby="ha-unlock-helper"
            required
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
          />
        </label>
        <p id="ha-unlock-helper" className="text-sm text-text-secondary">
          {copy.unlockHelper}
        </p>
        {error ? (
          <p role="alert" aria-live="assertive" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-blue-500 py-3 font-semibold text-white disabled:opacity-50 dark:bg-brand-orange-400"
        >
          פתיחה
        </button>
        <p className="text-center text-sm">
          <Link href="/ha/recovery" className="text-brand-blue-600 underline dark:text-brand-orange-300">
            מפתח שחזור
          </Link>
        </p>
      </form>
    </HaFlowShell>
  );
}
