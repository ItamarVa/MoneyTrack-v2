"use client";

/**
 * @deprecated Use EntityTransactionsSection from @/components/entity/entity-transactions-section
 */
import type { AnalysisFilter } from "@moneytrack/contracts";
import { EntityTransactionsSection } from "@/components/entity/entity-transactions-section";
import type { EntityDrillStep, SelectedBreakdownSlice } from "@/components/entity/entity-types";

type CategoryTransactionsSectionProps = {
  filter: AnalysisFilter;
  selectedMerchant: SelectedBreakdownSlice | null;
  onClearMerchant: () => void;
  onRowClick: (transactionId: string) => void;
  reloadToken?: number;
};

export function CategoryTransactionsSection({
  filter,
  selectedMerchant,
  onClearMerchant,
  onRowClick,
  reloadToken,
}: CategoryTransactionsSectionProps) {
  const steps: EntityDrillStep[] = selectedMerchant ? [selectedMerchant] : [];

  const handleStepsChange = (next: EntityDrillStep[]) => {
    if (next.length === 0) {
      onClearMerchant();
    }
  };

  return (
    <EntityTransactionsSection
      filter={filter}
      steps={steps}
      onStepsChange={handleStepsChange}
      onRowClick={onRowClick}
      reloadToken={reloadToken}
    />
  );
}
