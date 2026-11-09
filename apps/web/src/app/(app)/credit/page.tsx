import { Suspense } from "react";
import { CreditPageClient } from "@/components/credit/credit-page-client";
import he from "@/locales/he.json";

export default function CreditPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
          {he.creditPage.loading}
        </div>
      }
    >
      <CreditPageClient />
    </Suspense>
  );
}
