"use client";

/**
 * Authenticated app chrome: sidebar, page title, session user, and logout.
 */
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, UserRound } from "lucide-react";
import { BackgroundWorkChip } from "@/components/background-work-chip";
import { BrandLogo } from "@/components/brand-logo";
import { DarkModeToggle } from "@/components/dark-mode-toggle";
import { GlobalPeriodPicker } from "@/components/period/global-period-picker";
import { PeriodProvider } from "@/components/period/period-context";
import { BottomNav, MOBILE_BOTTOM_NAV_MAIN_PB } from "@/components/mobile/bottom-nav";
import { Sidebar, useSidebar } from "@/components/sidebar";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { ToastProvider } from "@/components/ui/toast";
import { logout, fetchSession } from "@/lib/api-client";

const titles: Record<string, string> = {
  "/dashboard": "לוח בקרה",
  "/transactions": "עסקאות",
  "/classify": "סיווג",
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
            <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border-subtle bg-surface-card/90 px-4 py-2 backdrop-blur-md supports-[padding:max(0px)]:pt-[max(0.5rem,env(safe-area-inset-top))] sm:gap-4 sm:px-6 lg:py-3 lg:supports-[padding:max(0px)]:pt-[max(0.75rem,env(safe-area-inset-top))]">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border-subtle text-text-primary lg:hidden"
                  onClick={sidebar.toggle}
                  aria-label="פתיחת תפריט"
                >
                  <Icon icon={Menu} size={20} />
                </button>
                <BrandLogo size="sm" showTagline={false} className="lg:hidden" />
                <span aria-hidden className="hidden h-6 w-px bg-border-subtle lg:block" />
                <PageTitle />
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <GlobalPeriodPicker />
                <span aria-hidden className="hidden h-6 w-px bg-border-subtle sm:block" />
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
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-subtle px-3 text-sm font-medium text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                >
                  <Icon icon={LogOut} size={16} />
                  <span className="hidden sm:inline">יציאה</span>
                </button>
                <DarkModeToggle />
              </div>
            </header>
            <main
              className={`flex-1 p-4 supports-[padding:max(0px)]:px-[max(1rem,env(safe-area-inset-left))] supports-[padding:max(0px)]:pe-[max(1rem,env(safe-area-inset-right))] sm:p-6 ${MOBILE_BOTTOM_NAV_MAIN_PB}`}
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
