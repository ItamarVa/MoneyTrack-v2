import { Suspense } from "react";
import { ClassifyPageClient } from "@/components/classify/classify-page-client";

export default function ClassifyPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
          טוען סיווג…
        </div>
      }
    >
      <ClassifyPageClient />
    </Suspense>
  );
}
