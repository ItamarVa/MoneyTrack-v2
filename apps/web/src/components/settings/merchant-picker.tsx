"use client";

/**
 * Searchable merchant picker for salary employer linking.
 * Loads income payers only, with debounced name search — not the full merchant table.
 */
import { useEffect, useId, useRef, useState } from "react";
import { fetchMerchants, type MerchantOption } from "@/lib/api-client";
import { LabelledField } from "@/components/ui/labelled-field";

const inputClass =
  "min-h-11 w-full rounded-lg border border-border-subtle bg-surface-bg px-3 text-sm";

type MerchantPickerProps = {
  id: string;
  label: string;
  value: string;
  onChange: (merchantId: string) => void;
  hint?: string;
};

export function MerchantPicker({ id, label, value, onChange, hint }: MerchantPickerProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MerchantOption[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!value) {
      setSelectedName("");
      return;
    }
    let cancelled = false;
    void fetchMerchants({ includeId: value, incomeOnly: true, limit: 1 }).then((rows) => {
      if (!cancelled) {
        setSelectedName(rows.find((row) => row.id === value)?.name ?? "");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetchMerchants({
        q: query.trim() || undefined,
        incomeOnly: true,
        limit: 25,
        includeId: value || undefined,
      })
        .then((rows) => {
          if (!cancelled) {
            setResults(rows);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, query, value]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function selectMerchant(merchant: MerchantOption) {
    onChange(merchant.id);
    setSelectedName(merchant.name);
    setQuery("");
    setOpen(false);
  }

  function clearSelection() {
    onChange("");
    setSelectedName("");
    setQuery("");
  }

  return (
    <LabelledField id={id} label={label}>
      <div ref={containerRef} className="relative">
        {value && selectedName ? (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-sm">
            <span className="truncate text-text-primary">{selectedName}</span>
            <button
              type="button"
              onClick={clearSelection}
              className="shrink-0 text-xs text-brand-blue-500 hover:underline"
            >
              הסרה
            </button>
          </div>
        ) : null}
        <input
          id={id}
          className={inputClass}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="חפשו מעסיק מהכנסות בחשבון"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          autoComplete="off"
        />
        {hint ? <p className="mt-1 text-xs text-text-muted">{hint}</p> : null}
        {open ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border-subtle bg-surface-card py-1 shadow-soft"
          >
            {loading ? (
              <li className="px-3 py-2 text-sm text-text-muted">מחפש…</li>
            ) : results.length === 0 ? (
              <li className="px-3 py-2 text-sm text-text-muted">
                {query.trim() ? "לא נמצאו מעסיקים תואמים" : "אין הכנסות מזוהות עדיין"}
              </li>
            ) : (
              results.map((merchant) => (
                <li key={merchant.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={merchant.id === value}
                    onClick={() => selectMerchant(merchant)}
                    className="w-full px-3 py-2 text-start text-sm text-text-primary hover:bg-surface-elevated"
                  >
                    {merchant.name}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </LabelledField>
  );
}
