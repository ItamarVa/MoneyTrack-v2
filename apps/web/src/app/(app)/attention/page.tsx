import { Suspense } from "react";
import { AttentionPageClient } from "@/components/attention/attention-page-client";

export default function AttentionPage() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-card bg-surface-card" aria-hidden="true" />}>
      <AttentionPageClient />
    </Suspense>
  );
}
