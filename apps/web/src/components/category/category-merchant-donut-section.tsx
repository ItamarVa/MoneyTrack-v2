"use client";

/**
 * @deprecated Use EntityBreakdownSection from @/components/entity/entity-breakdown-section
 */
import type { AnalysisFilter } from "@moneytrack/contracts";
import { EntityBreakdownSection } from "@/components/entity/entity-breakdown-section";
import type { EntityDrillStep, SelectedBreakdownSlice } from "@/components/entity/entity-types";

export type SelectedMerchant = SelectedBreakdownSlice;

type CategoryMerchantDonutSectionProps = {
  categoryId: string;
  categoryName?: string;
  filter: AnalysisFilter;
  selectedMerchant: SelectedMerchant | null;
  onMerchantSelect: (merchant: SelectedMerchant | null) => void;
  onTransactionSelect?: (transactionId: string) => void;
};

export function CategoryMerchantDonutSection({
  categoryId,
  categoryName = "",
  filter,
  selectedMerchant,
  onMerchantSelect,
  onTransactionSelect = () => undefined,
}: CategoryMerchantDonutSectionProps) {
  const steps: EntityDrillStep[] = selectedMerchant ? [selectedMerchant] : [];

  const handleStepsChange = (next: EntityDrillStep[]) => {
    onMerchantSelect(next.at(-1) ?? null);
  };

  return (
    <EntityBreakdownSection
      entityDimension="category"
      entityId={categoryId}
      entityName={categoryName}
      filter={filter}
      steps={steps}
      onStepsChange={handleStepsChange}
      onTransactionSelect={onTransactionSelect}
    />
  );
}
