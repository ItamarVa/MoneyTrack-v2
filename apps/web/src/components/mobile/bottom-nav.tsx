"use client";

/**
 * Phone tab bar: dashboard, credit, transactions, attention (with open-items badge), more.
 * The more tab opens MoreSheet with the rest. Hidden from lg where the sidebar owns navigation.
 * Item list and active matching live in nav-items.ts (unit tested).
 * MOBILE_BOTTOM_NAV_MAIN_PB must match the bar height.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Ellipsis } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAttentionCount } from "@/components/attention/use-attention-count";
import {
  ATTENTION_HREF,
  BOTTOM_ITEMS,
  attentionAriaLabel,
  attentionBadgeText,
  isActivePath,
  isMoreActive,
} from "@/components/mobile/nav-items";
import { MoreSheet } from "@/components/mobile/more-sheet";
import { Icon } from "@/components/ui/icon";
import { useEmbedded } from "@/components/use-embedded";
import he from "@/locales/he.json";

export type BottomNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** Main content padding below lg — keep in sync with tab bar visual height. */
export const MOBILE_BOTTOM_NAV_MAIN_PB =
  "max-lg:pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))]";

/** Embedded (HA iframe): the host app frame already handles device safe areas. */
export const MOBILE_BOTTOM_NAV_MAIN_PB_EMBEDDED = "max-lg:pb-[3.75rem]";

const TAB_BASE =
  "flex min-h-11 w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-orange-500";

function tabTone(active: boolean) {
  return active ? "text-brand-blue-600 dark:text-brand-orange-400" : "text-text-muted";
}

export function BottomNav() {
  const pathname = usePathname();
  const embedded = useEmbedded();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const moreActive = isMoreActive(pathname);
  const attentionCount = useAttentionCount();

  function closeMore() {
    setMoreOpen(false);
    moreButton.current?.focus();
  }

  return (
    <>
      <nav
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface-card/95 backdrop-blur-md lg:hidden ${
          embedded ? "pb-1" : "supports-[padding:max(0px)]:pb-[max(0.25rem,env(safe-area-inset-bottom))]"
        }`}
        aria-label={he.nav.bottomLabel}
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-1">
          {BOTTOM_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            const count = item.href === ATTENTION_HREF ? attentionCount : 0;
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  className={`${TAB_BASE} ${tabTone(active)}`}
                  aria-current={active ? "page" : undefined}
                  aria-label={count > 0 ? attentionAriaLabel(count) : undefined}
                >
                  <span className="relative">
                    <Icon icon={item.icon} size={22} />
                    {count > 0 ? (
                      <span
                        aria-hidden
                        dir="ltr"
                        className="absolute -end-2.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-brand-orange-500 px-1 text-[10px] font-semibold leading-4 text-white"
                      >
                        {attentionBadgeText(count)}
                      </span>
                    ) : null}
                  </span>
                  <span>{item.shortLabel}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              ref={moreButton}
              type="button"
              className={`${TAB_BASE} ${tabTone(moreActive || moreOpen)}`}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(true)}
            >
              <Icon icon={Ellipsis} size={22} />
              <span>{he.nav.moreLabel}</span>
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet open={moreOpen} pathname={pathname} onClose={closeMore} />
    </>
  );
}
