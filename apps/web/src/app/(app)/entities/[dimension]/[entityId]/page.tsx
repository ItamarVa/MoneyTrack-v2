import { Suspense } from "react";
import { BreakdownDimensionSchema } from "@moneytrack/contracts";
import { EntityPageClient } from "@/components/entity/entity-page-client";

type EntityDetailPageProps = {
  params: Promise<{ dimension: string; entityId: string }>;
};

export default async function EntityDetailPage({ params }: EntityDetailPageProps) {
  const { dimension: rawDimension, entityId } = await params;
  if (rawDimension === "category") {
    return (
      <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
        ישות לא נמצאה
      </div>
    );
  }

  const parsed = BreakdownDimensionSchema.safeParse(rawDimension);
  if (!parsed.success) {
    return (
      <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
        ישות לא נמצאה
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="rounded-card border border-border-subtle bg-surface-card px-6 py-16 text-center text-text-muted">
          טוען…
        </div>
      }
    >
      <EntityPageClient dimension={parsed.data} entityId={entityId} />
    </Suspense>
  );
}
