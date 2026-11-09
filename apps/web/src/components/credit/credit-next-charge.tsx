/**
 * Next charge card: what the cards will take from the bank account on the next charge date,
 * one headline total (all cards in play) and, with several cards, a row per card.
 * When no future charge exists it shows the last one and says so — never a made-up date.
 * Independent of the month toggle: a charge date is a fact, not a reporting choice.
 */
import { formatIls } from "@/lib/currency";
import { formatShortDate } from "@/lib/dates";
import he from "@/locales/he.json";
import { fillTemplate } from "@/components/category/category-options";
import { chargeHero, chargeTiming, cardLabel } from "./credit-utils";
import type { CardCharge, CreditCardCharges } from "./credit-types";

const copy = he.creditPage.nextCharge;

type CreditNextChargeProps = {
  /** Cards already narrowed to the page's card selection. */
  cards: CreditCardCharges[];
  /** The browser's calendar day, YYYY-MM-DD. */
  today: string;
};

function countText(count: number): string {
  return count === 1 ? copy.countOne : fillTemplate(copy.count, { count });
}

function timingText(today: string, charge: Pick<CardCharge, "kind" | "date">): string | null {
  const timing = chargeTiming(today, charge);
  if (timing.kind === "today") return copy.today;
  if (timing.kind === "tomorrow") return copy.tomorrow;
  if (timing.kind === "inDays") return fillTemplate(copy.inDays, { days: timing.days });
  return null;
}

export function CreditNextCharge({ cards, today }: CreditNextChargeProps) {
  const hero = chargeHero(cards);
  const isLast = hero?.kind === "last";
  const heroTiming =
    hero && hero.kind === "upcoming" && hero.date
      ? timingText(today, { kind: "upcoming", date: hero.date })
      : null;

  return (
    <section
      aria-label={copy.title}
      className="rounded-card border border-border-subtle bg-surface-card p-4 md:p-5"
    >
      <h2 className="font-display text-lg text-text-primary">{isLast ? copy.titleLast : copy.title}</h2>

      {hero ? (
        <div className="mt-3">
          <p className="font-display text-4xl leading-tight text-text-primary tabular-nums">
            <bdi dir="ltr">{formatIls(hero.amountIls)}</bdi>
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            {hero.date
              ? fillTemplate(isLast ? copy.onDateLast : copy.onDate, { date: formatShortDate(hero.date) })
              : copy.mixedDates}
            {heroTiming ? <span className="font-semibold text-brand-orange-500"> · {heroTiming}</span> : null}
          </p>
          <p className="mt-1 text-xs text-text-muted">{countText(hero.transactionCount)}</p>
          {isLast ? <p className="mt-2 text-xs text-text-muted">{copy.lastNote}</p> : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-text-muted">{copy.none}</p>
      )}

      {cards.length > 1 ? (
        <div className="mt-4 border-t border-border-subtle pt-3">
          <p className="mb-1 text-xs text-text-muted">{copy.perCard}</p>
          <ul className="divide-y divide-border-subtle">
            {cards.map((card) => (
              <li key={card.accountId} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-text-primary">{cardLabel(card)}</p>
                  <p className="text-xs text-text-muted">
                    {card.charge.date
                      ? formatShortDate(card.charge.date)
                      : copy.none}
                    {card.charge.kind === "last" ? ` · ${copy.lastBadge}` : ""}
                  </p>
                </div>
                {card.charge.kind === "none" ? null : (
                  <span className="shrink-0 text-base font-medium tabular-nums text-text-primary">
                    <bdi dir="ltr">{formatIls(card.charge.amountIls)}</bdi>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
