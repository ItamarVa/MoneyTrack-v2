---
topic: design-system
tags: [v2, rtl, brand, typography]
last_updated: 2026-09-15
status: active
owns:
  - apps/web/src/styles/**
  - apps/web/public/**
  - apps/web/src/app/globals.css
---

# Design System (MEM-DS)

## Direction

Refined institutional — deep navy field, generous negative space, orange accent ≤5% of screen.

## Brand tokens

Defined in `apps/web/src/styles/tokens.css`:

| Token | Value | Use |
|-------|-------|-----|
| `--brand-navy-900` | `#0C2448` | Primary dark surface |
| `--brand-navy-700` | `#1A3459` | Headings on light |
| `--brand-blue-500` | `#06578E` | Links, secondary |
| `--brand-orange-500` | `#F27803` | Single accent (CTA, active) |
| `--brand-orange-400` | `#FE9102` | Hover |

Semantic surfaces (`--surface-bg`, `--surface-card`, `--text-primary`, …) switch under `.dark`.

Money and chart colours are their own tokens, never raw hex in a component:
`--money-income`, `--money-expense`, `--chart-surplus`, `--chart-deficit`. All
four flip under `.dark`, as do `--brand-blue-500` and the two oranges — the light
brand values fail contrast on the navy field.

`.donut-balance-glow` pulses only inside `@media (prefers-reduced-motion: no-preference)`.

Dashboard dual-ring chart (`DualRingDonut`): chart box `max-w-96` top-aligned (`self-start`); outer ring 68–88% (expenses by dimension), inner ring 46–62% (income by `incomeDimension`, default salary). Balance highlights use `GlowingSector` via the Recharts 3 `Pie shape` prop — permanent leader-line labels removed; surplus/deficit explanation lives in the tooltip (`zIndex: 30` on the Recharts wrapper). Centre block: label + amount + stacked expense/income lines inside `max-w-[44%]`. Legend: dense rows, `sm:grid-cols-2` for expenses beside income, `max-h-72` scroll per column.

## Typography

- **Display:** Frank Ruhl Libre — `@fontsource-variable/frank-ruhl-libre` (self-hosted)
- **Body / UI / numbers:** IBM Plex Sans Hebrew — `@ibm/plex-sans-hebrew` (official package, not Fontsource)
- Global: `--default-font-feature-settings: "tnum" 1, "zero" 1`

## RTL

- `<html dir="rtl" lang="he">`
- Tailwind 4 logical utilities (`ms`, `me`, `ps`, `pe`, `start`, `end`, `border-s`, …)
- Chart plot areas and account numbers: `dir="ltr"`
- Currency: hand-composed via `formatIls()` — Unicode minus `U+2212`, no bidi marks, wrapped in `<bdi>`

## Dark mode

- Class-based: `@custom-variant dark (&:where(.dark, .dark *))`
- Inline boot script prevents flash; user choice in `localStorage` key `mt-theme` (`light` | `dark` | `system`)

## Logo assets (`apps/web/public/brand/`)

| File | Purpose |
|------|---------|
| `logo-source.jpg` | Unmodified source |
| `mark.png` | Circle+arrow icon, transparent background (sidebar, login, watermark) |

The wordmark is not an image. `BrandLogo` (`components/brand-logo.tsx`) renders
"MoneyTrack" and the tagline as live text so it stays sharp and follows the theme.
| `favicon.ico` | Browser tab |
| `apple-touch-icon.png` | iOS home screen (180) |
| `icon-192.png`, `icon-512.png` | PWA icons |

Regenerate: `python scripts/generate-brand-assets.py`

## Phase 1 UI shell

- Login: `(auth)/login` — Hebrew strings, `BrandLogo`, stub session
- App shell: sidebar (drawer on mobile), top bar with dark-mode toggle
- Empty state: watermark mark at low opacity
- Nav placeholders: עסקאות, חשבונות, ניתוח, הגדרות
