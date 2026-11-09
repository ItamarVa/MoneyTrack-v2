"use client";

/**
 * ⋯ overflow menu on an account card: edit name/owner and the household/business switch.
 * Moved off the card face so the balance stays the focus on a phone. Activity links are
 * quick links on the card itself.
 * Closes on outside tap or Escape; the trigger is a 44px target with an accessible name.
 */
import { Briefcase, MoreHorizontal, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import he from "@/locales/he.json";

type AccountActionsMenuProps = {
  accountName: string;
  isBusiness: boolean;
  busy: boolean;
  onToggleScope: () => void;
  onEdit: () => void;
};

const itemClass =
  "flex min-h-11 w-full items-center gap-2 px-4 text-start text-sm font-medium text-text-primary hover:bg-surface-elevated disabled:opacity-50";

export function AccountActionsMenu({
  accountName,
  isBusiness,
  busy,
  onToggleScope,
  onEdit,
}: AccountActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const copy = he.accountsUx.menu;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={copy.open.replace("{name}", accountName)}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-11 items-center justify-center rounded-lg border border-border-subtle hover:bg-surface-elevated"
      >
        <Icon icon={MoreHorizontal} size={20} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-12 z-20 min-w-56 overflow-hidden rounded-lg border border-border-subtle bg-surface-card shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
            className={itemClass}
          >
            <Icon icon={Pencil} size={14} />
            {he.accounts.edit}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onToggleScope();
            }}
            className={itemClass}
          >
            <Icon icon={Briefcase} size={14} />
            {isBusiness ? copy.markHousehold : copy.markBusiness}
          </button>
        </div>
      ) : null}
    </div>
  );
}
