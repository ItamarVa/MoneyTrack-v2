---
topic: categorization
tags: [v2, rules, pipeline]
last_updated: 2026-11-04
status: active
owns:
  - packages/classify/**
---

# Categorization (MEM-CAT)

## Pipeline (strict order, first match wins)

1. Normalize descriptor (versioned, unit-tested)
2. Manual decision (sacred — never overwritten)
3. Explicit user rules (by priority)
4. Learned merchant map (above confidence floor; 2 consistent manual edits suffice, confidence = min(1, n/3); a manual pick of another category restarts the streak at 1)
5. **Kind** (`decidedBy = "kind"`): bank rows only, maps `transactions.kind` to a fixed system category (below)
6. Provider category map (`transactions.provider_category` → `provider_category_map`; empty `category_id` = skip)
7. Fallback: `uncategorized`

Rule order inside stage 3: priority DESC, then longer pattern, then newest `created_at`, then id. Rules load once per pass (`loadEnabledRules`), not per transaction.

## Kind stage (`system-categories.ts`)

Without it ~75% of a month sat in `לא מסווג`: the engine typed bank lines but the classifier never read `kind`. Matching is by fixed category id only (a user category with the same name is never adopted or duplicated); a missing row means the bucket is skipped.

| Row | Category (id suffix) |
|-----|----------------------|
| `exclusion_reason = internal_transfer` (any account) | העברות פנימיות (`…0c2`, seed 0002) |
| bank `transfer` (fund move, pension/provident deposit) | חיסכון (`…0b1`, seed 0002) |
| bank `card_settlement` (issuer not connected; neutral, not a spend bucket) | חיובי כרטיס אשראי ללא פירוט (`…0c3`, top level, migration 0009) |
| bank `loan_payment` (mortgage debit) | החזרי הלוואות ומשכנתא (`…043`, migration 0009) |
| bank `income` | הכנסות (`…0c1`, seed 0002) |
| bank `expense` + withheld-tax or national-insurance stem (`system-categories.ts`) | מיסים ועמלות (`…0d0`, migration 0009) |
| bank `expense` + whole word `ביטוח` | ביטוח (`…070`, seed 0002) |

Card purchases, `refund`, and unmatched bank expenses (e.g. a P2P payment) fall through to provider / default. Salary-source matching is not used: every income row maps to the same category.

Migration `0009_system_categories.sql` seeds the three new categories (skipped when the same name already exists under the same parent) and, only when transactions exist, queues one `categorize_bulk` job over every period. The agent drains it; `getClassifyStatus` also kicks the web runner while it is queued. `reapplyRulesClassificationForPeriod` re-derives bank `kind` (`retagTransactionKind`) before classifying, so old rows pick up widened kind patterns; manual rows are untouched.

## No ML/LLM in v2

Deterministic, explainable, testable with golden files. Every transaction has a "why" panel from `categorization_decisions`.

## Phase 3 deliverables (complete)

- `packages/classify`: normalization (golden `fixtures/normalization.json`), pipeline, learned map, bulk reclassify.
- API: `/api/categories`, `/api/transactions/[id]/category`, `/classification`, `/split`, `/link`, `/reclassify`.
- UI: category picker, "why" panel on transaction table.
- Ingest/sync calls `classifyTransaction` after `runEnginePostProcess`; sync persists MAX `category` on `transactions.provider_category`.
- `/classify` page: uncategorized merchants (one-click merchant rules), MAX provider mapping editor, full reapply (`POST /api/classify/reapply`).
