# Ali's Store — Design System

The single source of truth for the storefront + admin UI. Everything here is
implemented in [`src/styles/globals.css`](../src/styles/globals.css) as CSS
custom properties and base component classes, with thin typed React wrappers in
[`src/components/ui/`](../src/components/ui). No Tailwind, no CSS-in-JS.

- **Light mode only** — by design. There is no theme toggle.
- **Bilingual EN/AR, full RTL** — logical properties everywhere; a small RTL
  section in `globals.css` covers what they don't.
- **Reference language (not a copy):** saxonwear.com editorial-luxury — neutral
  ink/white chrome that lets product photography carry the colour, uppercase
  tracked CTAs at minimal radius, one italic accent word per headline, size as
  text chips, colour as photo swatches, "Save $X" corner badges, two-image
  hover-swap cards, off-canvas slide-in panels.

---

## 1. Colour

### Neutrals, backgrounds, surfaces
| Token | Value | Use |
|---|---|---|
| `--color-bg` | `#ffffff` | Page background |
| `--color-bg-subtle` | `#faf9f7` | Alternating sections, auth/legal pages |
| `--color-surface` | `#f6f4f1` | Filter rails, footer, inset panels |
| `--color-surface-raised` | `#ffffff` | Cards, dropdowns, modals, drawers |
| `--color-surface-sunken` | `#efebe6` | Skeletons, track backgrounds |

### Text (all pass WCAG AA on `--color-bg` / `--color-surface`)
| Token | Value | Contrast on white | Use |
|---|---|---|---|
| `--color-text` | `#1c1917` | ~16:1 | Primary body + headings |
| `--color-text-secondary` | `#57514a` | ~7.8:1 | Secondary body |
| `--color-text-muted` | `#6b6459` | ~5.9:1 | Captions, meta — **light bg only, never on an accent** |
| `--color-text-disabled` | `#a8a29e` | — | Decorative only — never the sole carrier of meaning |
| `--color-text-inverse` | `#ffffff` | — | Text on dark fills |

### Primary / secondary / accent
| Token | Value | Notes |
|---|---|---|
| `--color-primary` / `-hover` | `#1c1917` / `#322d2a` | Ink. Wordmark + **primary CTA**. |
| `--color-on-primary` | `#ffffff` | |
| `--color-secondary` / `-hover` | `#44403c` / `#57514a` | Quiet emphasis |
| `--color-accent` / `-hover` | `#a16207` / `#855209` | Antique gold. White on it ≈ 5:1 (AA). **Used sparingly** — sale, active state, small emphasis. Never large fills. |
| `--color-on-accent` | `#ffffff` | |
| `--color-accent-soft` | `#f5ebdd` | Decorative fills / dividers — **non-text only** |

The primary CTA is **ink, not gold** (Saxon pattern). `.btn--accent` is
secondary emphasis and picks up the per-collection accent.

### Semantic — each is solid / tint-bg / on-tint text, and is **always paired with an icon**
| Role | Solid | Tint bg | On-tint text |
|---|---|---|---|
| success | `#2f6f4e` | `#e7f0ea` | `#1f5138` |
| warning (low stock, pending) | `#8a5a12` | `#fbf0dc` | `#6e480f` |
| danger (errors, destructive) | `#b4271d` | `#fbeae8` | `#8e241c` |
| info (neutral notices) | `#2a5b8c` | `#e7eff6` | `#1f476e` |

`--color-on-danger: #ffffff`. Order-status → colour map:
PENDING → warning · CONFIRMED / SHIPPED → info · DELIVERED → success ·
CANCELLED / RETURNED → danger.

### Borders + focus ring
| Token | Value | Use |
|---|---|---|
| `--color-border` | `#e4dfd8` | Hairlines, dividers |
| `--color-border-strong` | `#cfc8be` | Inputs, table cell dividers |
| `--color-ring` | `#1c1917` | **Global** focus ring — `2px solid`, `outline-offset: 2px`. Same on every page, including per-collection ones. |

---

## 2. Per-collection compound accents

One structural system; each "door" shifts **only** accent colour, container
radius and heading personality via `data-collection` on a page's root wrapper.
All three accents pass AA (≥ 4.5:1) with white text.

| Collection | `--collection-accent` | Radius | Heading | Tracking |
|---|---|---|---|---|
| `women` | `#a65a7e` rose | `--radius-lg` (soft) | Playfair serif | `0.005em` |
| `men` | `#38455c` navy | `--radius-sm` (sharp) | Inter sans | `0.01em` |
| `kids` | `#b4611e` orange | `--radius-lg` (soft) | Inter sans, bold | `0` |

Each also exposes `--collection-accent-soft` (tint) and `--collection-on-accent`.
Inputs and buttons keep one shape site-wide — only containers change radius.

---

## 3. Typography

- **Sans / UI / body:** Inter (`--font-sans`)
- **Display / headings:** Playfair Display (`--font-serif`) — LTR
- **Arabic:** Noto Naskh Arabic (`--font-arabic`) — all Arabic text, and the
  forced face for Arabic headings (Playfair has no Arabic coverage)
- **Mono:** system stack (`--font-mono`) — order numbers, SKUs
- `font-variant-numeric: tabular-nums` on prices, quantities, table numeric
  cells, dashboard stats (`.price-tag`, `.qty__value`, `.is-numeric` do this).

### Scale (each size ships with a paired line-height token)
| Token | Size | LH | Use |
|---|---|---|---|
| `--fs-2xs` | 11px | 1.4 | Legal, dense meta |
| `--fs-xs` | 12px | 1.5 | Badges, captions, `.eyebrow` |
| `--fs-sm` | 14px | 1.55 | Secondary text, table cells, buttons, nav |
| `--fs-base` | 16px | 1.6 | Body (min on mobile) |
| `--fs-lg` | 18px | 1.55 | Lead paragraph, card titles, `h4` |
| `--fs-xl` | 22px | 1.35 | `h3` |
| `--fs-2xl` | 28px | 1.25 | `h2` |
| `--fs-3xl` | `clamp(32→40px)` | 1.15 | `h1` |
| `--fs-4xl` | `clamp(40→56px)` | 1.05 | `.display` hero |

**Weights:** Playfair headings 500–600 (luxury reads lighter — not 700; kids
`h1/h2` are the exception at 700). Body 400. Labels / buttons / nav 500.
Emphasis 600.

**Devices:**
- `.eyebrow` — uppercase `--fs-xs`, `letter-spacing: 0.14em`, muted; sits above
  a serif headline as a section label.
- `<em>` inside a heading (or `.heading__accent`) — Playfair *italic*, same
  size/weight. Emphasise **one word**, never the whole line.
- Buttons / nav / labels render uppercase with `0.06em` tracking; tracking is
  dropped under `[lang='ar']`.
- `.prose` caps line length at `--measure` (68ch).

---

## 4. Spacing, radius, shadow, layout, motion

**Spacing** (4px base): `--space-1..10` = 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 /
80 / 96. `--section-gap: clamp(48px, 8vw, 96px)`. Tiers: inline 4–8 · component
12–24 · section 48–96.

**Radius** (minimal by default): `--radius-xs` 2 (badges) · `--radius-sm` 4
(inputs, buttons, cards) · `--radius-md` 8 (dropdowns) · `--radius-lg` 14
(modals, drawers, women/kids containers) · `--radius-pill`.

**Shadow** (warm-ink tint; elevation only — the UI is mostly flat/hairline):
`--shadow-xs` (sticky header once scrolled) · `--shadow-sm` (card hover) ·
`--shadow-md` (dropdowns/popovers) · `--shadow-lg` (modals/drawers).
`--shadow-focus` is the soft companion ring for inputs. `--scrim` =
`rgba(28,25,23,0.45)`.

**Layout:** `--container-max` 1280 · `--container-narrow` 768 (forms/auth/legal)
· `--gutter: clamp(16px, 5vw, 32px)` · `--header-height` 72 · `--control-h` 44
(min touch target / interactive height).

**Motion:** `--transition-fast` 150ms · `--transition-base` 250ms. All motion
is disabled under `prefers-reduced-motion` (global block + skeleton shimmer
off).

**z-index:** header 40 · dropdown 50 · scrim 58 · drawer 60 · toast 80.

---

## 5. Components

Import from `@/components/ui`. Each is a thin wrapper over a `globals.css`
class — style changes belong in the stylesheet, not the component.

| Component | Class(es) | Notes |
|---|---|---|
| `Button` | `.btn` `.btn--{primary,outline,ghost,accent,danger}` `.btn--{sm,lg,block}` | Uppercase, tracked, `--radius-sm`. `loading` → spinner + `aria-busy` + inert. `disabled`. Min height 44px (36 for `sm`). |
| `Icon` | — | Wraps `lucide-react`: `strokeWidth 1.75`, `size 20`, `aria-hidden` unless given `aria-label`. `flipRtl` mirrors chevrons/arrows. |
| `.icon-btn` | `.icon-btn` `.icon-btn--bordered` | 44×44 hit area, glyph 20–24. Always needs `aria-label`. Cart count → `.icon-btn__badge` inside `.icon-btn-wrap`. |
| `Field` | `.field` `.field__{label,required,hint,error}` | Render-prop: generates `id` + `aria-describedby` + `aria-invalid` and hands them to the control. Error shows an `AlertCircle` + `role="alert"`. |
| `Input` / `Select` / `Textarea` | `.input` `.select` `.textarea` | 44px min, `--color-border-strong`, ink focus ring, `aria-invalid` → danger border. Select caret mirrors under RTL. |
| `Choice` | `.choice` | Checkbox/radio + inline label, 44px row. |
| `SizeChip` | `.chip` in `.chip-group` | Text chips, not a dropdown. `selected` → ink fill. `outOfStock` → struck-through, `aria-disabled`, non-interactive. |
| `Swatch` | `.swatch` in `.swatch-group` | Product photo per colourway (flat colour fallback). `selected` → ink outline. `outOfStock` → dimmed + strike. Accessible name = "Colour: <name>". |
| `QuantityStepper` | `.qty` | Controlled −/＋. Labelled buttons, `aria-live` value. |
| `Badge` | `.badge--{sale,save,new,low-stock}` | `save` = Saxon "Save $X.00" corner badge; pass the formatted amount. |
| `StatusPill` | `.status--{pending,…}` | Dot + text label (never colour alone). Bilingual labels; maps the backend `OrderStatus` enum. |
| `ProductCard` | `.card.product-card` | 3:4 media, two-image hover swap when a 2nd image exists, "Save $X" badge, optional inline sizes line, 2-line name clamp. One `<Link>`. |
| `PriceTag` | `.price-tag` | `Intl.NumberFormat` per locale; struck compare price. Tabular figures. |
| `DataTable` | `.table` in `.table-wrap` | Sticky header, `.is-numeric` right-aligns + tabular. `responsive` collapses to a card list < 640px — needs `data-label` on every `<td>`. Sortable headers use `aria-sort`. |
| `Skeleton` / `ProductGridSkeleton` | `.skeleton` `.skeleton--{text,title,media,line}` `.skeleton-grid` | Shimmer; static under reduced-motion. |
| `EmptyState` | `.state` | Icon + serif title + body + one CTA. `tone="alert"` adds `role="alert"`. Used by `loading`/`error`/`not-found` route files and real empty states. |
| `Alert` | `.alert--{success,warning,danger,info}` | Icon + text; `role="alert"` (danger/warning) or `status` (success/info). Toasts use `.toast-region` / `.toast`. |
| `Drawer` | `.drawer` `.drawer--{start,end}` | Off-canvas panel. `start` = menu (from inline-start), `end` = cart/search (from inline-end); both mirror under RTL. Focus-trapped, `Esc` closes, background scroll locked, focus restored to trigger. |

### Chrome
- `SiteHeader` — announcement bar, wordmark, collection-switcher pills (desktop)
  → hamburger + `Drawer` under 768px, account / search / cart (with count
  badge) / language. Gains a hairline + `--shadow-xs` on scroll
  (`data-scrolled`).
- `SiteFooter` — 4-column (brand + newsletter stub / Shop / Customer service /
  About) + bottom bar. Newsletter has no submit wiring.
- `PagePlaceholder` — `EmptyState` for not-yet-built routes; carries
  `data-collection` so it previews the door's accent.

---

## 6. RTL

Logical properties (`margin-inline`, `inset-inline-*`, `padding-block`, …) flip
automatically. `globals.css` §6 handles the rest:

- `.icon-flip` (and `<Icon flipRtl>`) mirrors directional glyphs.
- `.drawer--start` / `--end` transforms are flipped explicitly for `[dir='rtl']`.
- `.select` caret position is flipped.
- `[lang='ar']` swaps the body + heading font to Noto Naskh and drops
  letter-spacing on uppercase labels/eyebrows.
- `dir` is set per-locale on `<html>` in `app/[locale]/layout.tsx`.
- Numbers/currency: always via `Intl` with the active locale (see `PriceTag`).

---

## 7. Accessibility baseline

- Global `:focus-visible` ink ring on every interactive element.
- Skip link (`.skip-link`) → `<main id="main">` in the root layout.
- All touch targets ≥ 44px (`--control-h`).
- Colour is never the only signal — semantic states pair colour with an icon
  and text; status pills add a dot.
- `prefers-reduced-motion` disables transitions/animations and the skeleton
  shimmer.
- Form errors: inline, `role="alert"`, linked via `aria-describedby`, field
  marked `aria-invalid`.
- Drawer/dialog: `role="dialog"` + `aria-modal`, focus trap, `Esc`, restore.

See [`design-system-verification.md`](./design-system-verification.md) for the
per-release QA matrix.
