import { Suspense } from "react";
import { DashboardPageClient } from "@/components/dashboard/dashboard-page-client";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
          טוען לוח בקרה…
        </div>
      }
    >
      <DashboardPageClient />
    </Suspense>
  );
}
