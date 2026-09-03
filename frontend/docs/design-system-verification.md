# Design System Verification

Manual QA pass for the design system (`src/styles/globals.css` +
`src/components/ui/*`). Light mode only, bilingual EN/AR + RTL. No automated
runner — walk the matrix in a browser with `npm run dev`.

Full spec: [`design-system.md`](./design-system.md).

## Setup

```bash
npm install      # pulls lucide-react
npm run dev      # http://localhost:3000 -> /en
```

## A. Foundations (do once per pass)

- [ ] `dir` on `<html>` is `rtl` for `/ar/*`, `ltr` for `/en/*`.
- [ ] Arabic text renders in **Noto Naskh Arabic**, incl. headings (not a
      system fallback) — confirms the `next/font` wiring + the `[lang='ar']`
      heading override.
- [ ] On `/`, `/women`, `/men`, `/kids` each door's accent colour / heading
      font / corner radius from `[data-collection]` is visibly distinct.
- [ ] **No emoji anywhere** — every icon is a Lucide glyph (header cart,
      account, search, menu; footer; state blocks).
- [ ] Skip link appears on first Tab and jumps focus to `<main>`.
- [ ] Every interactive element shows the ink `:focus-visible` ring
      (links, buttons, inputs, chips, swatches, drawer controls).
- [ ] All tap targets ≥ 44px (buttons, `.icon-btn`, chips, swatches, stepper).
- [ ] Sticky header gains a hairline + subtle shadow only after scrolling.

## B. `/dev/ui` component showcase (`/en/dev/ui` and `/ar/dev/ui`)

- [ ] Buttons: all variants + `sm`/`lg`; loading shows a spinner and is inert;
      disabled is dimmed and non-interactive; text is uppercase + tracked
      (EN) / not tracked (AR).
- [ ] Headings show one italic accent word, not a fully italic line.
- [ ] Badges + all six status pills render with a dot + label.
- [ ] Form: required asterisk; invalid email shows an inline error with icon +
      `role="alert"`; disabled/`aria-invalid` styles correct; select caret is
      on the correct side per direction.
- [ ] Size chips: selected = ink fill; the out-of-stock chip is struck-through
      and not clickable.
- [ ] Colour swatches: photo thumbnails; selected = ink outline; out-of-stock
      dimmed with a strike.
- [ ] Quantity stepper: `−`/`+` clamp at min/max; value is announced.
- [ ] Alerts: 4 tones, each icon + text, correct colours.
- [ ] Product cards: hover swaps to the 2nd image (women card); "Save $X"
      badge on sale items; sizes line shows.
- [ ] Table: sticky header, right-aligned numeric columns; at ≤ 640px it
      collapses to a labelled card list.
- [ ] Loading skeleton animates; **stops** with `prefers-reduced-motion`.
- [ ] Empty + error states: icon, serif title, body, single CTA.
- [ ] Drawer: opens, scrim visible, `Esc` closes, focus is trapped inside and
      returns to the trigger on close; slides from the correct edge in both
      directions.

## C. Route × locale (placeholder pages inherit the shell)

| Route | en | ar | Notes |
|---|---|---|---|
| `/` | ☐ | ☐ | collection doors |
| `/women` `/men` `/kids` | ☐ | ☐ | per-door accent |
| `/product/[id]` | ☐ | ☐ | |
| `/cart` `/checkout` | ☐ | ☐ | |
| `/account` `/orders` `/orders/[id]` | ☐ | ☐ | |
| `/login` `/register` | ☐ | ☐ | |
| `/admin` `/admin/products` `/admin/products/new` `/admin/products/[id]` `/admin/orders` | ☐ | ☐ | still shows storefront chrome — not a bug |
| unknown route | ☐ | ☐ | renders `not-found` state |

## D. Responsive & motion

- [ ] 375px: header collapses to hamburger → menu drawer; no horizontal
      scroll on any route; footer stacks.
- [ ] 768 / 1024 / 1440px: container maxes at 1280, gutters scale.
- [ ] `prefers-reduced-motion: reduce` (DevTools → Rendering): no transitions,
      no skeleton shimmer, layout intact.

## E. Accessibility

- [ ] axe DevTools / Lighthouse a11y ≥ 95 on `/`, `/en/dev/ui`, `/ar`.
- [ ] Contrast-check the three collection accent buttons and the focus ring
      against white and `--color-surface`.
- [ ] Keyboard-only pass on `/dev/ui`: reach every control, visible ring,
      drawer traps + restores focus.

## F. Build

- [ ] `npm run lint` — no errors.
- [ ] `npm run build` — passes (route-type validation + prerender of every
      locale route, incl. `not-found`).

---

## History

- **T1 (Week 1)** — verified fonts load (Inter / Playfair / Noto Naskh via
  `next/font`); removed dark mode (`theme-provider`/`theme-toggle`, dark
  tokens, header toggle) — light mode only, by design.
- **Design system foundation** — completed the token set (contrast-fixed
  collection accents, semantic warning/info, global ink focus ring, full
  type/spacing/shadow/z-index scales); added Lucide icons (all emoji removed),
  and base components: forms (`Field`/`Select`/`Textarea`/`Choice`), size
  chips, colour swatches, quantity stepper, status pills, data table,
  skeletons, empty/error state block, alerts, off-canvas drawer; added
  route-level `loading` / `error` / `not-found`; mobile nav drawer; skip link;
  `prefers-reduced-motion`.
