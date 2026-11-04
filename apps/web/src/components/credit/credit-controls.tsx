/**
 * The two controls that scope the whole credit page: the month-basis toggle and the card chips.
 * Both are plain button groups with 44px targets; the chip row wraps instead of scrolling
 * sideways so nothing hides off-screen at 375px.
 */
import type { DateBasis } from "@moneytrack/contracts";
import he from "@/locales/he.json";
import { cardLabel } from "./credit-utils";

const basisCopy = he.creditPage.basis;
const cardsCopy = he.creditPage.cards;

const BASIS_OPTIONS: { value: DateBasis; label: string; hint: string }[] = [
  { value: "charge", label: basisCopy.charge, hint: basisCopy.chargeHint },
  { value: "transaction", label: basisCopy.purchase, hint: basisCopy.purchaseHint },
];

function segmentClass(active: boolean): string {
  return [
    "min-h-11 flex-1 rounded-lg px-3 text-sm font-medium transition-colors",
    active
      ? "bg-brand-blue-500/15 text-brand-blue-500 ring-1 ring-inset ring-brand-blue-500"
      : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
  ].join(" ");
}

export function CreditBasisToggle({
  value,
  onChange,
}: {
  value: DateBasis;
  onChange: (next: DateBasis) => void;
}) {
  const active = BASIS_OPTIONS.find((option) => option.value === value) ?? BASIS_OPTIONS[0]!;
  return (
    <div>
      <div
        role="group"
        aria-label={basisCopy.label}
        className="flex gap-1 rounded-xl border border-border-subtle bg-surface-card p-1"
      >
        {BASIS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            onClick={() => onChange(option.value)}
            className={segmentClass(option.value === value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 px-1 text-xs text-text-muted">{active.hint}</p>
    </div>
  );
}

export type CardChipOption = { id: string; institutionCode: string; numberLast4: string | null };

function chipClass(active: boolean): string {
  return [
    "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors",
    active
      ? "border-brand-blue-500 bg-brand-blue-500/15 text-brand-blue-500"
      : "border-border-strong bg-surface-card text-text-secondary hover:text-text-primary",
  ].join(" ");
}

/** Only rendered with two or more cards; `selectedId` null means every card. */
export function CreditCardChips({
  cards,
  selectedId,
  onSelect,
}: {
  cards: CardChipOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div role="group" aria-label={cardsCopy.label} className="flex flex-wrap gap-2">
      <button
        type="button"
        aria-pressed={selectedId === null}
        onClick={() => onSelect(null)}
        className={chipClass(selectedId === null)}
      >
        {cardsCopy.all}
      </button>
      {cards.map((card) => (
        <button
          key={card.id}
          type="button"
          aria-pressed={selectedId === card.id}
          onClick={() => onSelect(card.id)}
          className={chipClass(selectedId === card.id)}
        >
          {cardLabel(card)}
        </button>
      ))}
    </div>
  );
}
