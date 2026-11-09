"use client";

/**
 * "Reclassify everything" action: re-runs the rules over every stored transaction.
 * Lives in Settings > Advanced; progress shows in BackgroundWorkChip in the app shell header.
 */
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { reclassifyAll } from "@/lib/api-client";
import he from "@/locales/he.json";

const copy = he.plainUx.settings.reapply;

export function ReapplyAllSection() {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  async function handleClick(): Promise<void> {
    setBusy(true);
    try {
      await reclassifyAll();
      showToast(copy.started, "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : copy.failed, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void handleClick()}
      className="min-h-11 rounded-lg bg-brand-blue-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
    >
      {busy ? copy.busy : copy.button}
    </button>
  );
}
