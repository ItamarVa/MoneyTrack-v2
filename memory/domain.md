---
topic: domain
tags: [v2, financial-engine, israeli-rules]
last_updated: 2026-09-15
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
