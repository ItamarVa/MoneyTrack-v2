import { Suspense } from "react";
import { CategoryPageClient } from "@/components/category/category-page-client";

export default function CategoryDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
          טוען קטגוריה…
        </div>
      }
    >
      <CategoryPageClient />
    </Suspense>
  );
}
