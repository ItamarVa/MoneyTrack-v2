"use client";

/**
 * Dialog for POST /api/people/[id]/merge: pick the person to fold a duplicate into, read the
 * irreversible warning, confirm. Split from people-panel.tsx; the merge itself is one server
 * transaction (server/people-merge.ts). Copy lives in he.json under personMerge.
 */
import type { Person } from "@moneytrack/contracts";
import { useEffect, useId, useRef, useState } from "react";
import he from "@/locales/he.json";
import { mergePerson } from "@/lib/api-client";

const t = he.personMerge;

type Props = {
  source: Person | null;
  people: Person[];
  onClose: () => void;
  onMerged: () => void | Promise<void>;
  onError: (message: string) => void;
};

export function PersonMergeDialog({ source, people, onClose, onMerged, onError }: Props) {
  const titleId = useId();
  const descId = useId();
  const selectId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [targetId, setTargetId] = useState("");
  const [merging, setMerging] = useState(false);
  const sourceId = source?.id ?? null;

  useEffect(() => {
    setTargetId("");
    if (sourceId) cancelRef.current?.focus();
  }, [sourceId]);

  useEffect(() => {
    if (!sourceId || merging) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sourceId, merging, onClose]);

  if (!source) return null;

  const targets = people
    .filter((p) => p.id !== source.id)
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "he"));

  async function merge() {
    if (!source || !targetId) return;
    setMerging(true);
    try {
      await mergePerson(source.id, targetId);
      await onMerged();
    } catch (err) {
      onError(err instanceof Error ? err.message : t.failed);
    } finally {
      setMerging(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-brand-navy-900/50 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md rounded-card border border-border-subtle bg-surface-card p-6 shadow-soft"
      >
        <h2 id={titleId} className="font-display text-lg text-text-primary">{t.dialogTitle}</h2>
        <div id={descId}>
          <p className="mt-3 text-sm text-text-secondary">
            {t.dialogIntro.replaceAll("{name}", source.displayName)}
          </p>
          <p className="mt-3 rounded-lg bg-brand-orange-500/10 px-3 py-2 text-sm font-medium text-brand-orange-500">
            {t.warning}
          </p>
        </div>
        {targets.length === 0 ? (
          <p className="mt-4 text-sm text-text-muted">{t.noTargets}</p>
        ) : (
          <div className="mt-4">
            <label htmlFor={selectId} className="block text-sm text-text-primary">
              {t.targetLabel}
            </label>
            <select
              id={selectId}
              value={targetId}
              disabled={merging}
              onChange={(e) => setTargetId(e.target.value)}
              className="mt-1 min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
            >
              <option value="">{t.targetPlaceholder}</option>
              {targets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={merging}
            className="min-h-11 rounded-lg border border-border-subtle px-4 text-sm font-medium hover:bg-surface-elevated disabled:opacity-60"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            disabled={merging || !targetId}
            onClick={() => void merge()}
            className="min-h-11 rounded-lg bg-brand-orange-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {merging ? t.merging : t.confirmButton}
          </button>
        </div>
      </div>
    </div>
  );
}
