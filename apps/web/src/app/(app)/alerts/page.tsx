import { Suspense } from "react";
import { AlertsPageClient } from "@/components/alerts/alerts-page-client";

export default function AlertsPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
          טוען התראות…
        </div>
      }
    >
      <AlertsPageClient />
    </Suspense>
  );
}
