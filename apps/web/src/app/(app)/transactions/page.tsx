import { Suspense } from "react";
import { TransactionsPageClient } from "@/components/transactions/transactions-page-client";

export default function TransactionsPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
          טוען עסקאות…
        </div>
      }
    >
      <TransactionsPageClient />
    </Suspense>
  );
}
