"use client";

/**
 * Collapsed-by-default titled section with a one-line helper, used for the rarely needed drawer
 * tools (splits, links). The header is a 44px button with aria-expanded; the body only mounts when open.
 * Used by: drawer-split-section, drawer-link-section.
 */
import { useId, useState, type ReactNode } from "react";

type DrawerCollapsibleProps = {
  title: string;
  helper: string;
  /** Small hint shown beside the title while collapsed (e.g. "unsaved"). */
  badge?: string;
  onToggle?: (open: boolean) => void;
  children: ReactNode;
};

export function DrawerCollapsible({
  title,
  helper,
  badge,
  onToggle,
  children,
}: DrawerCollapsibleProps) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <section className="rounded-lg border border-border-subtle">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => {
          setOpen(!open);
          onToggle?.(!open);
        }}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-2 text-start"
      >
        <span className="text-sm font-semibold text-text-primary">
          {title}
          {badge ? (
            <span className="ms-2 text-xs font-normal text-brand-orange-500">{badge}</span>
          ) : null}
        </span>
        <span aria-hidden="true" className="text-text-muted">
          {open ? "▴" : "▾"}
        </span>
      </button>
      <p className="px-4 pb-3 text-xs text-text-muted">{helper}</p>
      {open ? (
        <div id={bodyId} className="space-y-3 border-t border-border-subtle p-4">
          {children}
        </div>
      ) : null}
    </section>
  );
}
