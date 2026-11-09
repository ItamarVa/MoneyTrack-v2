"use client";

/**
 * Note, tags and exclude-from-totals fields of the drawer. These three are saved together by the
 * sticky footer button; the parent owns the state and the dirty diff.
 * Used by: transaction-detail-drawer.
 */
import type { Tag } from "@moneytrack/contracts";
import he from "@/locales/he.json";

const copy = he.transactionDrawer;

type DrawerMetaFieldsProps = {
  note: string;
  onNote: (value: string) => void;
  tags: Tag[];
  selectedTagIds: string[];
  onToggleTag: (tagId: string) => void;
  excluded: boolean;
  onExcluded: (value: boolean) => void;
  reason: string;
  onReason: (value: string) => void;
};

export function DrawerMetaFields({
  note,
  onNote,
  tags,
  selectedTagIds,
  onToggleTag,
  excluded,
  onExcluded,
  reason,
  onReason,
}: DrawerMetaFieldsProps) {
  return (
    <>
      <section className="space-y-2">
        <label htmlFor="tx-note" className="text-sm font-semibold text-text-primary">
          {copy.noteTitle}
        </label>
        <textarea
          id="tx-note"
          value={note}
          onChange={(event) => onNote(event.target.value)}
          rows={3}
          maxLength={2000}
          className="w-full rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-sm"
          placeholder={copy.notePlaceholder}
        />
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-text-primary">{copy.tagsTitle}</h3>
        {tags.length === 0 ? (
          <p className="text-xs text-text-muted">{copy.tagsEmpty}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const active = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onToggleTag(tag.id)}
                  className={[
                    "min-h-11 rounded-full px-4 text-xs font-medium transition",
                    active
                      ? "bg-brand-blue-500 text-white"
                      : "bg-surface-elevated text-text-secondary hover:bg-surface-bg",
                  ].join(" ")}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2 rounded-lg border border-border-subtle bg-surface-elevated/40 p-4">
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-text-primary">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={excluded}
            onChange={(event) => onExcluded(event.target.checked)}
          />
          {copy.excludeLabel}
        </label>
        <p className="text-xs text-text-muted">{copy.excludeHelper}</p>
        {excluded ? (
          <input
            type="text"
            value={reason}
            onChange={(event) => onReason(event.target.value)}
            aria-label={he.plainUx.transactionDrawer.exclusionReasonPlaceholder}
            placeholder={he.plainUx.transactionDrawer.exclusionReasonPlaceholder}
            className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface-card px-3 py-2 text-sm"
          />
        ) : null}
      </section>
    </>
  );
}
