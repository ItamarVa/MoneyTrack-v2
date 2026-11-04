"use client";

/**
 * Two-step dialog for POST /api/categories/[id]/merge: pick a target, then confirm with the
 * number of transactions that will move. Split from categories-panel.tsx to keep that file small.
 * The transaction count comes from GET on the same route; the merge itself is one server transaction.
 */
import type { Category } from "@moneytrack/contracts";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import he from "@/locales/he.json";
import { apiUrl } from "@/lib/base-path";

const t = he.categoryMerge;

type Props = {
  source: Category | null;
  categories: Category[];
  onClose: () => void;
  onMerged: () => void | Promise<void>;
  onError: (message: string) => void;
};

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

/** Source plus every category below it; none of these can be a merge target. */
function subtreeIds(rootId: string, categories: Category[]): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        grew = true;
      }
    }
  }
  return ids;
}

export function CategoryMergeDialog({ source, categories, onClose, onMerged, onError }: Props) {
  const titleId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [targetId, setTargetId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);

  const sourceId = source?.id ?? null;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    setTargetId("");
    setConfirming(false);
    setCount(null);
    if (!sourceId) return;
    cancelRef.current?.focus();
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(apiUrl(`/api/categories/${sourceId}/merge`), { cache: "no-store" });
        if (!res.ok) throw new Error(await readError(res, t.countFailed));
        const data = (await res.json()) as { transactionCount: number };
        if (!cancelled) setCount(data.transactionCount);
      } catch (err) {
        if (!cancelled) onErrorRef.current(err instanceof Error ? err.message : t.countFailed);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceId]);

  useEffect(() => {
    if (!sourceId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sourceId, onClose]);

  const options = useMemo(() => {
    if (!sourceId) return [];
    const excluded = subtreeIds(sourceId, categories);
    const nameOf = new Map(categories.map((c) => [c.id, c.name]));
    return categories
      .filter((c) => !excluded.has(c.id))
      .map((c) => ({
        id: c.id,
        label: c.parentId && nameOf.has(c.parentId) ? `${nameOf.get(c.parentId)} › ${c.name}` : c.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "he"));
  }, [categories, sourceId]);

  if (!source) return null;

  const target = options.find((o) => o.id === targetId);

  async function merge() {
    if (!source || !targetId) return;
    setMerging(true);
    try {
      const res = await fetch(apiUrl(`/api/categories/${source.id}/merge`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetId }),
      });
      if (!res.ok) throw new Error(await readError(res, t.failed));
      await onMerged();
    } catch (err) {
      onError(err instanceof Error ? err.message : t.failed);
    } finally {
      setMerging(false);
    }
  }

  const confirmText =
    count === null
      ? t.counting
      : (count > 0 ? t.confirmBody : t.confirmBodyNone)
          .replace("{count}", String(count))
          .replace("{target}", target?.label ?? "");

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-brand-navy-900/50 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-card border border-border-subtle bg-surface-card p-6 shadow-soft"
      >
        <h2 id={titleId} className="font-display text-lg text-text-primary">{t.dialogTitle}</h2>
        {confirming ? (
          <p className="mt-3 text-sm text-text-secondary">{confirmText}</p>
        ) : (
          <>
            <p className="mt-3 text-sm text-text-secondary">
              {t.dialogIntro.replaceAll("{name}", source.name)}
            </p>
            <label className="mt-4 block text-sm text-text-primary">
              {t.targetLabel}
              <select
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm"
              >
                <option value="">{t.targetPlaceholder}</option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={confirming ? () => setConfirming(false) : onClose}
            disabled={merging}
            className="min-h-11 rounded-lg border border-border-subtle px-4 text-sm font-medium hover:bg-surface-elevated disabled:opacity-60"
          >
            {confirming ? t.back : t.cancel}
          </button>
          {confirming ? (
            <button
              type="button"
              disabled={merging || count === null}
              onClick={() => void merge()}
              className="min-h-11 rounded-lg bg-brand-orange-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {merging ? t.merging : t.confirmButton}
            </button>
          ) : (
            <button
              type="button"
              disabled={!targetId}
              onClick={() => setConfirming(true)}
              className="min-h-11 rounded-lg bg-brand-blue-500 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {t.next}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
