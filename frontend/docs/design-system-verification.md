# Design System Verification — T1

Manual pass confirming the design system (`src/styles/globals.css`) renders
correctly — light/dark theme, RTL — across every route while pages are
still `<PagePlaceholder>` stubs. No automated test runner is used for this
(the task is "verify," not "add tests"); walk the matrix below in a
browser with `npm run dev` running.

**Per-page checks:**
- `dir` on `<html>` is `rtl` for `/ar/*`, `ltr` for `/en/*`.
- Light/dark contrast holds (toggle via the header's theme icon — cycles
  light → dark → system).
- On `/`, `/women`, `/men`, `/kids`: the department accent color/heading
  font/radius from `[data-department]` is visibly distinct per door.
- Arabic text renders in Noto Naskh Arabic (not a system-font fallback) —
  confirms the next/font wiring in `layout.tsx` actually took effect.
- `/admin/*` intentionally still shows the storefront header/footer (see
  its own TODO comment in `admin/layout.tsx`) — **not a bug to log here.**

`system` theme (OS `prefers-color-scheme`) is spot-checked separately via
DevTools emulation on 3–4 pages rather than the full matrix — it's a
device-level setting, not a per-route concern.

## Route × locale × theme

| Route | en / light | en / dark | ar / light | ar / dark | Notes |
|---|---|---|---|---|---|
| `/` | ☐ | ☐ | ☐ | ☐ | |
| `/women` | ☐ | ☐ | ☐ | ☐ | |
| `/men` | ☐ | ☐ | ☐ | ☐ | |
| `/kids` | ☐ | ☐ | ☐ | ☐ | |
| `/product/[id]` | ☐ | ☐ | ☐ | ☐ | |
| `/cart` | ☐ | ☐ | ☐ | ☐ | |
| `/checkout` | ☐ | ☐ | ☐ | ☐ | |
| `/account` | ☐ | ☐ | ☐ | ☐ | |
| `/orders` | ☐ | ☐ | ☐ | ☐ | |
| `/orders/[id]` | ☐ | ☐ | ☐ | ☐ | |
| `/login` | ☐ | ☐ | ☐ | ☐ | |
| `/register` | ☐ | ☐ | ☐ | ☐ | |
| `/admin` | ☐ | ☐ | ☐ | ☐ | |
| `/admin/products` | ☐ | ☐ | ☐ | ☐ | |
| `/admin/products/new` | ☐ | ☐ | ☐ | ☐ | |
| `/admin/products/[id]` | ☐ | ☐ | ☐ | ☐ | |
| `/admin/orders` | ☐ | ☐ | ☐ | ☐ | |

## System theme spot-check

| Page | OS light | OS dark |
|---|---|---|
| `/` | ☐ | ☐ |
| `/women` | ☐ | ☐ |
| `/checkout` | ☐ | ☐ |
| `/admin` | ☐ | ☐ |

## Known issues fixed during this pass

- **Fonts never loaded** — `globals.css` declared `--font-sans`/`--font-serif`/
  `--font-arabic` but nothing actually loaded Inter/Playfair Display/Noto
  Naskh Arabic, so the department heading-font distinction and Arabic
  script were untestable. Fixed via `next/font/google` in
  `app/[locale]/layout.tsx` (see its `inter`/`playfair`/`notoNaskhArabic`
  consts) + the `--font-*` chains in `globals.css` now referencing those
  CSS variables first.
