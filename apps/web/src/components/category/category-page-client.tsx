"use client";

/**
 * Category detail page — thin wrapper around the shared entity detail layout.
 */
import { useParams } from "next/navigation";
import { EntityPageClient } from "@/components/entity/entity-page-client";

export function CategoryPageClient() {
  const params = useParams();
  const categoryId = String(params.categoryId ?? "");

  return (
    <div className="min-w-0">
      <EntityPageClient dimension="category" entityId={categoryId} showInsights />
    </div>
  );
}

