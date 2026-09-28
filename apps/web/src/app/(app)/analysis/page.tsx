import { Suspense } from "react";
import { AnalysisPageClient } from "@/components/analysis/analysis-page-client";

export default function AnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
          טוען ניתוח…
        </div>
      }
    >
      <AnalysisPageClient />
    </Suspense>
  );
}
