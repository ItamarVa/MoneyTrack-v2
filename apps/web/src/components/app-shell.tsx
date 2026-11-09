"use client";

/**
 * Authenticated app chrome: sidebar, page title, session user, and logout.
 * Embedded in an iframe (Home Assistant ingress) HA already supplies the top bar and device
 * safe areas, so below lg the header shrinks to the month picker alone (theme and logout move
 * to the bottom-nav "more" sheet), safe-area padding is dropped, and the logo goes everywhere.
 * Standalone keeps the full header with safe-area padding (matters for an installed PWA).
 */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, UserRound } from "lucide-react";
import { BackgroundWorkChip } from "@/components/background-work-chip";
import { BrandLogo } from "@/components/brand-logo";
import { DarkModeToggle } from "@/components/dark-mode-toggle";
import { GlobalPeriodPicker, PERIOD_AWARE_PREFIXES } from "@/components/period/global-period-picker";
import { PeriodProvider } from "@/components/period/period-context";
import {
  BottomNav,
  MOBILE_BOTTOM_NAV_MAIN_PB,
  MOBILE_BOTTOM_NAV_MAIN_PB_EMBEDDED,
} from "@/components/mobile/bottom-nav";
import { Sidebar, useSidebar } from "@/components/sidebar";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { StaleDataBanner } from "@/components/sync/stale-data-banner";
import { ToastProvider } from "@/components/ui/toast";
import { useEmbedded } from "@/components/use-embedded";
import { useSessionExpiry } from "@/components/use-session-expiry";
import { logout, fetchSession } from "@/lib/api-client";
import he from "@/locales/he.json";

const titles: Record<string, string> = {
  "/dashboard": "לוח בקרה",
  "/credit": he.nav.items.credit.label,
  "/transactions": "עסקאות",
  "/attention": he.attention.title,
  "/classify": he.nav.items.classify.label,
  "/accounts": "חשבונות",
  "/loans": "הלוואות",
  "/analysis": "ניתוח",
  "/alerts": "התראות",
  "/networth": "שווי נקי",
  "/settings": "הגדרות",
};

function PageTitle() {
  const pathname = usePathname();
  const title = titles[pathname] ?? "MoneyTrack";
  return (
    <h1 className="hidden font-display text-lg font-semibold leading-tight lg:block">{title}</h1>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const sidebar = useSidebar();
  const embedded = useEmbedded();
  useSessionExpiry();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const session = await fetchSession();
        if (cancelled) {
          return;
        }
        if (!session.authenticated || !session.user) {
          router.replace("/login");
          return;
        }
        setUsername(session.user.username);
        setReady(true);
      } catch {
        if (!cancelled) {
          router.replace("/login");
        }
      }
    }

    void checkSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  // Embedded phone header holds only the period picker; on other routes it would be empty.
  const periodAware = PERIOD_AWARE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const hideHeaderOnPhone = embedded && !periodAware;

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-bg p-6">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  }

  return (
    <PeriodProvider>
      <ToastProvider>
        <div className="flex min-h-screen bg-surface-bg text-text-primary">
          <Sidebar open={sidebar.open} onClose={sidebar.close} />
          <div className="flex min-w-0 flex-1 flex-col">
            <header
              className={[
                "sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-border-subtle bg-surface-card/90 px-4 backdrop-blur-md sm:gap-x-4 sm:px-6 lg:flex-nowrap lg:py-3",
                embedded
                  ? "py-1"
                  : "py-2 supports-[padding:max(0px)]:pt-[max(0.5rem,env(safe-area-inset-top))] lg:supports-[padding:max(0px)]:pt-[max(0.75rem,env(safe-area-inset-top))]",
                hideHeaderOnPhone ? "max-lg:hidden" : "",
              ].join(" ")}
            >
              <div className={`flex min-w-0 items-center gap-3 ${embedded ? "max-lg:hidden" : ""}`}>
                <button
                  type="button"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border-subtle text-text-primary lg:hidden"
                  onClick={sidebar.toggle}
                  aria-label="פתיחת תפריט"
                >
                  <Icon icon={Menu} size={20} />
                </button>
                {/* Wordmark drops below 400px so the row never crowds; the icon stays. */}
                {embedded ? null : (
                  <BrandLogo
                    size="sm"
                    showTagline={false}
                    className="shrink-0 max-[399px]:[&>div]:hidden lg:hidden"
                  />
                )}
                <span aria-hidden className="hidden h-6 w-px bg-border-subtle lg:block" />
                <PageTitle />
              </div>
              <GlobalPeriodPicker />
              <div
                className={`flex shrink-0 items-center gap-2 sm:gap-3 ${embedded ? "max-lg:hidden" : ""}`}
              >
                <span aria-hidden className="hidden h-6 w-px bg-border-subtle lg:block" />
                <BackgroundWorkChip />
                {username ? (
                  <span className="hidden items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-sm text-text-secondary sm:inline-flex">
                    <Icon icon={UserRound} size={16} />
                    {username}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-border-subtle px-3 text-sm font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                >
                  <Icon icon={LogOut} size={16} />
                  <span className="hidden sm:inline">יציאה</span>
                </button>
                <DarkModeToggle />
              </div>
            </header>
            <StaleDataBanner />
            <main
              className={`flex-1 p-4 sm:p-6 ${
                embedded
                  ? MOBILE_BOTTOM_NAV_MAIN_PB_EMBEDDED
                  : `supports-[padding:max(0px)]:px-[max(1rem,env(safe-area-inset-left))] supports-[padding:max(0px)]:pe-[max(1rem,env(safe-area-inset-right))] ${MOBILE_BOTTOM_NAV_MAIN_PB}`
              }`}
            >
              {children}
            </main>
            <BottomNav />
          </div>
        </div>
      </ToastProvider>
    </PeriodProvider>
  );
}
