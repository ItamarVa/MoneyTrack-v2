"use client";

/**
 * Slide-up panel for filters and pickers on narrow viewports (Track E1/E2).
 */
import { useEffect, useId, type ReactNode } from "react";

type BottomSheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function BottomSheet({ open, title, onClose, children }: BottomSheetProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="סגירה"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[min(85vh,640px)] overflow-y-auto rounded-t-2xl border border-border-subtle bg-surface-card px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="font-display text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 rounded-lg border border-border-subtle px-3 text-sm font-medium text-text-secondary"
          >
            סגור
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
