import { Suspense } from "react";
import { NetWorthPageClient } from "@/components/networth/networth-page-client";

export default function NetWorthPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
          טוען שווי נקי…
        </div>
      }
    >
      <NetWorthPageClient />
    </Suspense>
  );
}
