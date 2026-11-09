import { Suspense } from "react";
import he from "@/locales/he.json";
import { ClassifyPageClient } from "@/components/classify/classify-page-client";

export default function ClassifyPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
          {he.classifyHub.loading}
        </div>
      }
    >
      <ClassifyPageClient />
    </Suspense>
  );
}
