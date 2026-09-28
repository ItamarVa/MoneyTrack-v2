---
topic: categorization
tags: [v2, rules, pipeline]
last_updated: 2026-09-15
status: active
owns:
  - packages/classify/**
---

# Categorization (MEM-CAT)

## Pipeline (strict order, first match wins)

1. Normalize descriptor (versioned, unit-tested)
2. Manual decision (sacred — never overwritten)
3. Explicit user rules (by priority)
4. Learned merchant map (above confidence floor)
5. Provider category map (`transactions.provider_category` → `provider_category_map`; empty `category_id` = skip)
6. Fallback: `uncategorized`

## No ML/LLM in v2

Deterministic, explainable, testable with golden files. Every transaction has a "why" panel from `categorization_decisions`.

## Phase 3 deliverables (complete)

- `packages/classify`: normalization (golden `fixtures/normalization.json`), pipeline, learned map, bulk reclassify.
- API: `/api/categories`, `/api/transactions/[id]/category`, `/classification`, `/split`, `/link`, `/reclassify`.
- UI: category picker, "why" panel on transaction table.
- Ingest/sync calls `classifyTransaction` after `runEnginePostProcess`; sync persists MAX `category` on `transactions.provider_category`.
- `/classify` page: uncategorized merchants (one-click merchant rules), MAX provider mapping editor, full reapply (`POST /api/classify/reapply`).
