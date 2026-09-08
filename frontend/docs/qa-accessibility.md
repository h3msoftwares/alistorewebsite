# QA pass — accessibility

Cross-cutting a11y QA (Module 9) + the fixes it produced (the "bug-fix
buffer"). Target: WCAG 2.1 AA for the essentials — labels, focus, contrast,
semantics, keyboard operability.

## Method

- Static scan of every route's components for: `alt` text, `aria-label` on
  icon-only controls, `<label>`/`aria-labelledby` on inputs, heading order,
  landmarks, `lang`/`dir`.
- Keyboard walk of the primary journeys (browse → cart → checkout; admin
  order fulfilment) with no mouse.
- Colour-contrast check of the token palette (`:root` in `globals.css`).

## Structural guarantees (verified)

| Area | Status | Evidence |
|---|---|---|
| Language & direction | ✓ | `<html lang={locale} dir={dir}>` in `app/[locale]/layout.tsx` |
| Skip link | ✓ | `<a href="#main" class="skip-link">` → `<main id="main">`, visible on first Tab |
| Landmarks | ✓ | `<header>`, `<nav aria-label>`, `<main id="main">`, `<footer>` |
| Focus visibility | ✓ | global `:focus-visible` ink ring on links, buttons, inputs, chips, swatches, drawer/modal controls |
| Focus management | ✓ | `Modal` + `Drawer` trap focus, close on Esc, restore focus to the opener on close; body scroll locked while open |
| Icon-only controls | ✓ | every `.icon-btn` (admin list actions, image gallery remove, variant remove, topbar menu, modal close, filter pin) carries `aria-label` + `title` |
| Images | ✓ | no bare `<img>` without `alt`; `next/image` usages pass `alt` (decorative ones use `alt=""`) |
| Form fields | ✓ | `<Field>` wires `<label htmlFor>` + `aria-describedby` for hints and `role="alert"` + `aria-invalid` for errors; RHF `register` spread onto every input |
| Live regions | ✓ | `<Alert>` uses `role="alert"` (danger/warning) or `role="status"` (success/info); field errors `role="alert"` |
| Tap targets | ✓ | buttons / `.icon-btn` / chips / swatches / stepper ≥ 44px (design-system checklist item) |
| Tables | ✓ | `<DataTable>` = real `<table>/<thead>/<th>`; responsive stack keeps `data-label` as the row-header text |
| Contrast | ✓ | body ink (navy `#190066`) on `#fafbfe` ≈ 15:1; `--color-on-primary` (navy on gold) ≈ 12:1 — chosen over white which fails on the gold; muted text ≥ 4.6:1; footer lavender-on-navy ≈ 8.3:1 |

## Per-area keyboard walk

- **Storefront browse** — header nav, search overlay (combobox with
  `aria-expanded` + `role="listbox"`), filter drawer, product cards, size/
  colour chips: all reachable and operable by keyboard; drawer returns focus.
- **Cart / checkout** — quantity stepper, remove, coupon input + Apply,
  address form, place-order: full tab order, inline errors announced, the
  hCaptcha step is a labelled region.
- **Admin orders** — status `<select>` (`aria-label` per row), "Mark
  collected" / "Mark reviewed" buttons, the new **confirm** and **delivery-
  estimate** modals: the modals are `role="dialog" aria-modal="true"` with an
  accessible name, trap focus, and the estimate input is a labelled `<Field>`
  with an inline `role="alert"` error. Esc / the Cancel button both abort.
- **Admin dashboard** — action tiles are real `<a>` links with descriptive
  text; the 30-day trend chart is decorative-supplementary (the same numbers
  are in the stat tiles and `/admin/analytics`), so the SVG is not a
  keyboard trap.

## Findings & fixes this pass

- No missing labels, alt text, or focus traps found — the UI kit
  (`components/ui/*`) centralises the correct patterns and every feature page
  uses it.
- The admin status-change modals (added this cycle) were built on the shared
  `Modal`, so they inherit the focus-trap / Esc / restore behaviour and were
  given an `aria-label` via the `title` prop plus a visible `<h2>`.
- The dashboard trend chart's `ResponsiveContainer` emits a benign
  zero-size warning under jsdom in tests only; no runtime/a11y impact.

## Known limitations (documented, not blockers)

- Recharts SVGs (`/admin/analytics`, dashboard trend) are not individually
  screen-reader annotated; the underlying data is available as text/tables
  elsewhere on the same page.
- No automated axe/pa11y run wired into CI yet — this pass is manual +
  static. A `pa11y-ci` job is a reasonable follow-up.
