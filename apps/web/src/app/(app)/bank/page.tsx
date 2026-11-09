import { Suspense } from "react";
import { BankPageClient } from "@/components/bank/bank-page-client";
import he from "@/locales/he.json";

export default function BankPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
          {he.bankPage.loading}
        </div>
      }
    >
      <BankPageClient />
    </Suspense>
  );
}
