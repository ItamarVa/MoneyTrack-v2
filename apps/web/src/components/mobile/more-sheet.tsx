"use client";

/**
 * Bottom sheet behind the "more" tab: the screens that do not fit the tab bar.
 * BottomSheet supplies the dialog, backdrop and Escape; this adds focus handling
 * (first row on open, Tab kept inside) and the route list. Focus return to the tab
 * button is done by BottomNav. Rendered only below lg, like the tab bar.
 * The last two rows (theme, logout) live here because the phone header carries only the
 * month picker when embedded in Home Assistant.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogOut, SunMoon } from "lucide-react";
import { BottomSheet } from "@/components/mobile/bottom-sheet";
import { MORE_ITEMS, isActivePath } from "@/components/mobile/nav-items";
import { Icon } from "@/components/ui/icon";
import { logout } from "@/lib/api-client";
import { applyTheme, readStoredTheme, storeTheme, type ThemeMode } from "@/lib/theme";
import he from "@/locales/he.json";

const FOCUSABLE = "a[href], button:not([disabled])";
const ux = he.embeddedUx;
const THEME_ORDER: ThemeMode[] = ["light", "dark", "system"];
const THEME_LABEL: Record<ThemeMode, string> = {
  light: ux.themeLight,
  dark: ux.themeDark,
  system: ux.themeSystem,
};
const ROW_CLASS =
  "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-text-primary hover:bg-surface-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-orange-500";

function ThemeRow() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    setMode(readStoredTheme());
  }, []);

  function cycle() {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(mode) + 1) % THEME_ORDER.length] ?? "system";
    setMode(next);
    storeTheme(next);
    applyTheme(next);
  }

  return (
    <button type="button" onClick={cycle} className={ROW_CLASS}>
      <Icon icon={SunMoon} size={22} className="shrink-0" />
      <span className="flex-1 text-sm font-medium">{ux.themeRow}</span>
      <span className="text-xs text-text-muted">{THEME_LABEL[mode]}</span>
    </button>
  );
}

function LogoutRow({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  async function handleLogout() {
    onClose();
    await logout();
    router.replace("/login");
  }

  return (
    <button type="button" onClick={() => void handleLogout()} className={ROW_CLASS}>
      <Icon icon={LogOut} size={22} className="shrink-0" />
      <span className="text-sm font-medium">{ux.logout}</span>
    </button>
  );
}

function MoreList({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const dialog = list?.closest<HTMLElement>('[role="dialog"]');
    if (!list || !dialog) {
      return;
    }
    (list.querySelector<HTMLElement>("[aria-current]") ?? list.querySelector<HTMLElement>("a"))?.focus();

    function trapTab(event: KeyboardEvent) {
      if (event.key !== "Tab" || !dialog) {
        return;
      }
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", trapTab);
    return () => document.removeEventListener("keydown", trapTab);
  }, []);

  return (
    <nav aria-label={he.nav.moreListLabel}>
      <ul ref={listRef} className="flex flex-col gap-1">
        {MORE_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-orange-500",
                  active
                    ? "bg-brand-orange-500 text-white"
                    : "text-text-primary hover:bg-surface-elevated",
                ].join(" ")}
              >
                <Icon icon={item.icon} size={22} className="shrink-0" />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className={active ? "text-xs text-white/85" : "text-xs text-text-muted"}>
                    {item.description}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-col gap-1 border-t border-border-subtle pt-2">
        <ThemeRow />
        <LogoutRow onClose={onClose} />
      </div>
    </nav>
  );
}

type MoreSheetProps = {
  open: boolean;
  pathname: string;
  onClose: () => void;
};

export function MoreSheet({ open, pathname, onClose }: MoreSheetProps) {
  return (
    <BottomSheet open={open} title={he.nav.moreTitle} onClose={onClose}>
      <MoreList pathname={pathname} onClose={onClose} />
    </BottomSheet>
  );
}
