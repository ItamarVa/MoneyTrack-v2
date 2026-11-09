"use client";

import type { HaStatusResponse } from "@moneytrack/contracts";
import Link from "next/link";
import { useState } from "react";
import { HaFlowShell } from "@/components/ha/ha-flow-shell";
import { PinPad } from "@/components/mobile/pin-pad";
import { apiUrl } from "@/lib/base-path";
import he from "@/locales/he.json";
import { useRouter } from "next/navigation";

export default function HaPinPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function verifyPin(pin: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/ha/pin"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = (await response.json()) as { error?: string; code?: string };
      if (!response.ok) {
        if (data.code === "pin_locked") {
          setError(he.haPassphrase.pinLocked);
          return;
        }
        setError(data.error ?? "קוד שגוי");
        return;
      }
      // A correct PIN whose session cookie the browser refused would loop back here silently.
      const status = (await (await fetch(apiUrl("/api/ha/status"), { cache: "no-store" })).json()) as HaStatusResponse;
      if (status.phase !== "unlocked") {
        setError(he.haPin.sessionNotSaved);
        return;
      }
      router.replace("/dashboard");
    } catch {
      setError("שגיאת רשת");
    } finally {
      setLoading(false);
    }
  }

  return (
    <HaFlowShell title="קוד PIN">
      <PinPad disabled={loading} error={error} onComplete={verifyPin} />
      <p className="mt-6 text-center text-sm">
        <Link href="/ha/unlock" className="text-brand-blue-600 underline dark:text-brand-orange-300">
          שכחתי PIN / נעול
        </Link>
      </p>
    </HaFlowShell>
  );
}
