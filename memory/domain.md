---
topic: domain
tags: [v2, financial-engine, israeli-rules]
last_updated: 2026-11-09
status: active
owns:
  - packages/engine/**
---

# Israeli Financial Domain Rules (MEM-DOMAIN)

Phase 3 financial engine (`packages/engine`) implements §4 domain rules that make totals trustworthy.

## Installments

- Scraper always uses `combineInstallments: false`.
- Installment `date` is shifted forward by `(number - 1)` months — engine reverses this to recover true `purchase_date`.
- Parent `purchases` row reconstructed from `installment_total × slice amount`, linked via `purchase_id`.
- **Two native views:** `queryPurchaseTotalsByPurchaseDate` (full purchase at purchase date) vs `queryInstallmentCashOutflow` (monthly slices by charge or transaction date).

## What counts as spending (owner decisions, 2026-09-14)

Three rules decide whether a shekel reaches a household total. All three were
wrong until 2026-09-14, when the first bank connection exposed them: the
dashboard read a month at several times its real spend and double-counted
every MAX purchase.

1. **Card settlements** (`settlement.ts`, `card-settlements.ts`). `resolveCardIssuer`
   reads the issuer out of the bank description; the old patterns
   (`חיוב כרטיס`, `max card`, `isracard`) matched none of the real Discount
   wording (`מקס איט פי חיוב`, `ישראכרט חיוב`, `כ.א.ל חיוב`). A settlement counts
   as an expense unless that issuer has a `credit_card` account, in which case we
   already hold the itemised charges and `processCardSettlements` excludes the
   bank row. Never match a bare `כאל` — that also sits inside `מיכאל`.
2. **Savings moves** (`savings.ts`). Money-market funds, provident/pension
   deposits and drawn loans become `kind = transfer`, which contributes 0 to both
   income and expense. Bank rows only: a shop may legitimately be called `מיטב`.
   Widened 2026-11-04 with generic whole-word stems on bank **debits** only
   (`פנסיה`, `גמל`, `השתלמות` → `transfer`; a credit may be a pension annuity and stays
   income). Mortgage debits (`משכנ`, `משכנתא`, `החזר/פרעון הלוואה`) become
   `loan_payment`, which still counts as an expense. `KindInput.direction` is optional;
   unknown counts as debit. Insurance and securities-tax lines keep `expense`; the
   classifier recognises them by description (MEM-CAT, kind stage).
3. **Business scope**. See MEM-DATA — a `business` account is outside every
   household total.

## Double-counting (card settlements)

- Issuer-level exclusion (`processCardSettlements`) runs first, then the finer
  card-level matcher: bank `card_settlement` debit matched to the sum of card
  charges in the billing window (tolerance ±2 ILS or 1%, card resolved via last4
  / `cardFrame`).
- On match: `transaction_links(card_settlement)` + `excluded_from_totals` on bank row.
- Unmatched settlements → `alerts` type `unmatched_settlement`, but only for an
  issuer we actually scrape; otherwise there is nothing to match and the alert
  would be noise.

## Card-bill reconciliation

- `card-reconciliation.ts` (read-only, `GET /api/credit/reconciliation`): per household card and charge month, bank `card_settlement` rows (bank accounts, signed, all exclusion states) vs. every posted card row of that charge month signed by direction (debits +, credits −, any kind, excluded or not — the issuer bills them all; pending skipped). Card resolved by existing `card_settlement` links, else last4 (account or `cards.last4`) in the description, else the issuer's cards; several cards → one combined group. Month: the bank pays one bill in several debits (interim debits during the month + the main one on the charge day), so a debit belongs to the first known charge date on/after it (window: previous charge date, this one], with a 2-day grace for a weekend-shifted main debit, if that date is ≤31 days ahead; otherwise (gap months, after the last known charge) the month is projected from the charge day-of-month. Coverage: a card is detailed from its earliest `source=file` charge month, or the month after its earliest `sync` charge month (the scraper first month is partial); card with no rows = never covered. Not every issuer debit in the window is the bill: the issuer also debits for an unconnected old card (Max on the 9th), transfers/cash and prepaid-card loads (Isracard same-day or the 3rd), while interim prepayments during the month are part of the next bill. So per month: charge date ≥ today → `open` (all debits billed). Else the non-empty subset of the window's debits summing to the detailed total within 1 ₪ is the bill → `match` (exhaustive; only the charge-day debits — ±2 days of the charge date — plus the largest others, 16 in all, are tried; preference: most charge-day debits, then smallest gap, then fewest debits). No subset: before coverage → `no_details` (all debits billed); else billed = the charge-day debits only → `mismatch`, or `no_bill` when none is near the charge date. Each month returns `debits` (counted in billed: date, signed amount, raw description) and `extras` (the window's other debits, informational, never a problem). No debit in the window → `no_bill` (only inside bank data).
- Excluded rows (`excluded_from_totals`) drop out of totals, charts and breakdowns only; every detail list (bank, credit, search, drill-downs) still shows them with a "not counted" badge. The bank page lists by `transactionDate` (statement date): bank card-load rows carry a value-date `chargeDate` a month later. Its summary counts every row (real cash flow).

## Internal transfers

- **Both descriptions must be worded as a transfer** (`looksLikeAccountTransfer`),
  then paired debit/credit across household accounts within ±3 days and amount
  tolerance → `transaction_links(internal_transfer)`, both sides excluded.
- Amount alone is not evidence: matching on it produced 19 false links out of 25
  (a nursery purchase paired with a Bit withdrawal), each deleting a real expense
  and a real income from the books.
- Manual override: `POST /api/transactions/[id]/link`.

## Refunds

- Credit at merchant with prior matching debit → `refund_of` link; offsets expense (`expenseContribution` negative), never income.
- Unmatched credits stay `kind = refund` for review.

## Foreign currency

- Columns: `original_amount`, `original_currency`, `amount_ils`, `fx_rate`, `fx_fee_ils`.
- BOI representative rate from `reference_series` / `reference_observations`, fallback `egressFetch` to BOI `GetExchangeRates`.

## Rollups

- `rollup_monthly` materialized for both `date_basis`: `transaction` and `charge`.
- Dirty periods invalidated on ingest; incremental `recomputeRollups`.
- Dashboard KPIs: `queryDashboardKpis`, `queryRollupTotals`.

## Post-ingest hook

`runEnginePostProcess` called from `sync-runner.ts` after transaction upsert.
