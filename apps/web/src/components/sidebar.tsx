"use client";

/**
 * Primary navigation sidebar with Lucide icons and mobile drawer behaviour.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useAttentionCount } from "@/components/attention/use-attention-count";
import {
  ATTENTION_HREF,
  SIDEBAR_ITEMS,
  attentionAriaLabel,
  attentionBadgeText,
  isActivePath,
} from "@/components/mobile/nav-items";
import { Icon } from "@/components/ui/icon";
import { useEmbedded } from "@/components/use-embedded";
import he from "@/locales/he.json";

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const embedded = useEmbedded();
  const attentionCount = useAttentionCount();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 p-4" aria-label={he.nav.sidebarLabel}>
      {SIDEBAR_ITEMS.map((item) => {
        const active = isActivePath(pathname, item.href);
        const count = item.href === ATTENTION_HREF ? attentionCount : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={[
              "flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-orange-500",
              active
                ? "bg-brand-orange-500 text-white shadow-sm"
                : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
            ].join(" ")}
            aria-current={active ? "page" : undefined}
            aria-label={count > 0 ? attentionAriaLabel(count) : undefined}
          >
            <Icon icon={item.icon} size={18} />
            {item.label}
            {count > 0 ? (
              <span
                aria-hidden
                dir="ltr"
                className={[
                  "ms-auto flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold leading-5",
                  active ? "bg-white text-brand-orange-500" : "bg-brand-orange-500 text-white",
                ].join(" ")}
              >
                {attentionBadgeText(count)}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <div
        className={[
          "fixed inset-0 z-40 bg-brand-navy-900/50 backdrop-blur-sm transition lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={[
          "fixed inset-y-0 start-0 z-50 flex w-72 flex-col border-e border-border-subtle bg-surface-card shadow-soft transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:shadow-none",
          open ? "translate-x-0" : "max-lg:ltr:-translate-x-full max-lg:rtl:translate-x-full",
        ].join(" ")}
        aria-label="תפריט צד"
      >
        {/* Embedded in HA: its own title already says MoneyTrack, so the logo block is a duplicate. */}
        {embedded ? null : (
          <Link
            href="/dashboard"
            onClick={onClose}
            className="border-b border-border-subtle px-5 py-5 transition hover:bg-surface-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-orange-500"
            aria-label="MoneyTrack — לוח בקרה"
          >
            <BrandLogo size="md" priority />
          </Link>
        )}
        {nav}
        <div className="mt-auto border-t border-border-subtle px-5 py-4 text-xs text-text-muted">
          <div className="flex items-center gap-2">
            <Icon icon={Wallet} size={16} />
            <span>MoneyTrack v2</span>
          </div>
        </div>
      </aside>
    </>
  );
}

export function useSidebar() {
  const [open, setOpen] = useState(false);
  return { open, setOpen, toggle: () => setOpen((v) => !v), close: () => setOpen(false) };
}
