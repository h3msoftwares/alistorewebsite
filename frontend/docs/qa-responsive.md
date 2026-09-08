# QA pass — responsive layout + RTL

Cross-cutting QA for every page (Module 9). Complements the component-level
[`design-system-verification.md`](./design-system-verification.md).

**Scope note:** the storefront is **light mode only** — dark mode was
deliberately removed (see `src/styles/globals.css` and the design-system
memo). There is therefore no dark/light pass; the visual-mode axis is RTL
(`/ar/*`) vs LTR (`/en/*`).

## How to run

```bash
cd frontend && npm run dev        # http://localhost:3000
```

Walk each route at three widths and in both locales. DevTools device toolbar
presets: **iPhone SE (360×667)**, **iPad (768×1024)**, **Desktop (1280×800)**.
Structural guarantees that make most of this pass by construction:

- `:where(html){ overflow-x: clip }` — the page body can never scroll
  sideways; a too-wide child is clipped, not a horizontal scrollbar.
- Wide content (tables, chart cards, code) lives in an `overflow-x:auto`
  container; `.data-table--responsive` collapses to stacked rows under 768px.
- All layout uses flex/grid + `min-width:0` on shrinkable items and logical
  properties (`inset-inline-*`, `margin-inline-*`) so RTL mirrors for free.

## Route matrix

Legend: **✓** verified clean · **n/a** not applicable

| Route | 360 | 768 | 1280 | RTL (`/ar`) | Notes |
|---|:---:|:---:|:---:|:---:|---|
| `/` (home: hero, featured rows, Visit-us) | ✓ | ✓ | ✓ | ✓ | Hero copy splits to gutters ≥720px, stacks below; row arrows hidden on touch widths; Visit-us grid 1-up → auto-fit. |
| `/[collection]` | ✓ | ✓ | ✓ | ✓ | Filter bar collapses to a "Filters" drawer ≤767px; category grid 2-up on mobile. |
| `/category/[slug]` | ✓ | ✓ | ✓ | ✓ | Same filter/grid behaviour. |
| `/product/[id]` | ✓ | ✓ | ✓ | ✓ | Gallery above details on mobile, side-by-side ≥900px; size/colour chips wrap. |
| `/cart` | ✓ | ✓ | ✓ | ✓ | Line table → stacked rows ≤767px; summary sticks on desktop. |
| `/checkout` | ✓ | ✓ | ✓ | ✓ | Form one column on mobile, form + sticky summary ≥900px; coupon row wraps. |
| `/orders`, `/orders/[id]`, `/orders/lookup`, `/orders/track/[token]` | ✓ | ✓ | ✓ | ✓ | Order cards full-width on mobile; detail table stacks. |
| `/account` | ✓ | ✓ | ✓ | ✓ | Address cards 1-up → 2-up. |
| `/favourites` | ✓ | ✓ | ✓ | ✓ | Product grid shares the listing-grid rules. |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | ✓ | ✓ | ✓ | ✓ | Centred single-column card, max-width capped. |
| `/privacy`, `/delivery-returns` | ✓ | ✓ | ✓ | ✓ | `.prose` max-width; long words wrap; RTL sets `dir` on the `<article>`. |
| `/ali-admin-login` | ✓ | ✓ | ✓ | ✓ | Same auth-card layout. |
| `/[...rest]` (404) | ✓ | ✓ | ✓ | ✓ | Centred empty-state. |
| **Admin** `/admin` (dashboard) | ✓ | ✓ | ✓ | ✓ | Stat tiles `auto-fit minmax(10rem)`; 30-day trend chart in a `ChartCard` that scrolls its own body; recent-orders table stacks. |
| `/admin/orders` | ✓ | ✓ | ✓ | ✓ | `DataTable responsive` stacks; status modals are width-capped (`min(88vw,26rem)`). |
| `/admin/products` (+ `/new`, `/[id]`) | ✓ | ✓ | ✓ | ✓ | List table stacks; variant rows wrap; image gallery grid re-flows. |
| `/admin/collections`, `/admin/categories` (+ forms) | ✓ | ✓ | ✓ | ✓ | Same list/form patterns. |
| `/admin/discounts` | ✓ | ✓ | ✓ | ✓ | Tabbed; form rows `admin-form__row` collapse to one column; discount/coupon tables stack. |
| `/admin/settings` | ✓ | ✓ | ✓ | ✓ | Searchable tabbed form; store-locations sub-forms and hours rows wrap. |
| `/admin/analytics/*` | ✓ | ✓ | ✓ | ✓ | Each chart in a `ChartCard`; `analytics-page__row` is `auto-fit minmax(22rem)`; tables scroll inside `overflow-x:auto`. |

## Findings & fixes this pass

- No horizontal-scroll or clipped-control regressions found — the
  `overflow-x:clip` + `min-width:0` conventions hold across the new pages
  (Visit-us, discounts, privacy, dashboard chart).
- `.store-info__grid[data-count='1']` caps a lone store card at 40rem so it
  doesn't stretch on desktop (added with the feature).
- `.checkout__coupon-entry` is `display:flex; width:100%` so the input +
  Apply button stay on one line down to 360px.
- Admin status-change modals use `.admin-modal { width: min(88vw, 26rem) }`
  so they never exceed the viewport on mobile.

## RTL spot-checks (`/ar/*`)

- [x] Header/footer, drawers and the filter drawer open from the correct
      (inline-end) side.
- [x] Arabic renders in Noto Naskh incl. headings; no Latin fallback.
- [x] Uppercase letter-spacing on CTAs/eyebrows is dropped under `[lang='ar']`.
- [x] Numeric/price columns stay LTR (`dir="ltr"` on the value spans) inside
      RTL tables (orders, cart, store hours).
- [x] Icons that imply direction (chevrons, "get directions") mirror via
      logical properties.
