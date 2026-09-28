"use client";

/**
 * Mobile bottom tab bar (Track E1 wires routes and active state).
 * Hidden from lg breakpoint where the sidebar owns navigation.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Bell, ChartPie, LayoutDashboard, List, MoreHorizontal } from "lucide-react";
import { Icon } from "@/components/ui/icon";

export type BottomNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

/** Main content padding below lg — keep in sync with tab bar visual height. */
export const MOBILE_BOTTOM_NAV_MAIN_PB =
  "max-lg:pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))]";

const DEFAULT_ITEMS: BottomNavItem[] = [
  { href: "/dashboard", label: "לוח", icon: LayoutDashboard },
  { href: "/transactions", label: "עסקאות", icon: List },
  { href: "/analysis", label: "ניתוח", icon: ChartPie },
  { href: "/alerts", label: "התראות", icon: Bell },
  { href: "/settings", label: "עוד", icon: MoreHorizontal },
];

type BottomNavProps = {
  items?: BottomNavItem[];
};

export function BottomNav({ items = DEFAULT_ITEMS }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border-subtle bg-surface-card/95 backdrop-blur-md lg:hidden supports-[padding:max(0px)]:pb-[max(0.25rem,env(safe-area-inset-bottom))]"
      aria-label="ניווט תחתון"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-1">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={[
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-medium",
                  active ? "text-brand-blue-600 dark:text-brand-orange-400" : "text-text-muted",
                ].join(" ")}
              >
                <Icon icon={item.icon} size={22} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
