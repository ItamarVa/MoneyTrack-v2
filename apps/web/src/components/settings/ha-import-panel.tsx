"use client";

/**
 * HA add-on: one-time import of the Windows export. The file is uploaded from
 * the browser, or taken from the Samba share when one waits there
 * (`importAvailable` from /api/ha/status). Renders nothing outside the add-on.
 * Import replaces all household data, so it asks first and reloads afterwards.
 */
import type { HaStatusResponse } from "@moneytrack/contracts";
import { FormEvent, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { apiUrl } from "@/lib/base-path";
import he from "@/locales/he.json";

const copy = he.haImport;

const FIELD_CLASS =
  "w-full rounded-lg border border-border-strong bg-surface-bg px-4 py-3 text-base text-text-primary focus:border-brand-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-blue-500/25";

export function HaImportPanel() {
  const { showToast } = useToast();
  const [haMode, setHaMode] = useState(false);
  const [onShare, setOnShare] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [exportCode, setExportCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(apiUrl("/api/ha/status"), { cache: "no-store" })
      .then(async (response) => {
        if (response.ok) {
          setHaMode(true);
          setOnShare(((await response.json()) as HaStatusResponse).importAvailable);
        }
      })
      .catch(() => setHaMode(false));
  }, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setConfirming(true);
  }

  async function runImport() {
    setConfirming(false);
    setImporting(true);
    setError("");
    const exportPassphrase = exportCode.trim();
    let request: RequestInit;
    if (file) {
      const form = new FormData();
      form.append("file", file);
      form.append("exportPassphrase", exportPassphrase);
      request = { method: "POST", body: form };
    } else {
      request = {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exportPassphrase }),
      };
    }
    try {
      const response = await fetch(apiUrl("/api/import"), request);
      if (!response.ok) {
        const data = (await response.json()) as { error?: string; code?: string };
        const known = data.code ? (copy.errors as Record<string, string>)[data.code] : undefined;
        setError(known ?? data.error ?? copy.errors.import_failed);
        return;
      }
      showToast(copy.success, "success");
      window.location.reload();
    } catch {
      setError(copy.errors.network);
    } finally {
      setImporting(false);
    }
  }

  if (!haMode) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-card border border-border-subtle bg-surface-card p-4">
      <div>
        <h2 className="text-base font-semibold text-text-primary">{copy.title}</h2>
        <p className="mt-1 text-sm text-text-muted">{copy.description}</p>
      </div>
      <form className="space-y-3" onSubmit={onSubmit}>
        <label className="block text-sm font-medium">
          {copy.fileLabel}
          <input
            type="file"
            accept=".db"
            className={`${FIELD_CLASS} mt-1`}
            aria-describedby="ha-import-file-helper"
            required={!onShare}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <p id="ha-import-file-helper" className="text-sm text-text-secondary">
          {onShare ? copy.fileOnShare : copy.fileHelper}
        </p>
        <label className="block text-sm font-medium">
          {copy.codeLabel}
          <input
            type="password"
            className={`${FIELD_CLASS} mt-1`}
            autoComplete="off"
            aria-describedby="ha-import-helper"
            required
            value={exportCode}
            onChange={(event) => setExportCode(event.target.value)}
          />
        </label>
        <p id="ha-import-helper" className="text-sm text-text-secondary">
          {copy.codeHelper}
        </p>
        {error ? (
          <p role="alert" aria-live="assertive" className="text-sm text-red-600">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={importing}
          className="min-h-11 rounded-lg bg-brand-blue-500 px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-brand-orange-400"
        >
          {importing ? copy.importing : copy.submit}
        </button>
      </form>
      <ConfirmDialog
        open={confirming}
        title={copy.confirmTitle}
        message={copy.confirmMessage}
        confirmLabel={copy.submit}
        tone="danger"
        onConfirm={() => void runImport()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
