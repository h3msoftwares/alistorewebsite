# Design System Verification — T1

Manual pass confirming the design system (`src/styles/globals.css`) renders
correctly — light mode only (no dark mode/theme toggle — deliberately not
wanted), RTL — across every route while pages are still `<PagePlaceholder>`
stubs. No automated test runner is used for this (the task is "verify," not
"add tests"); walk the matrix below in a browser with `npm run dev` running.

**Per-page checks:**
- `dir` on `<html>` is `rtl` for `/ar/*`, `ltr` for `/en/*`.
- On `/`, `/women`, `/men`, `/kids`: the department accent color/heading
  font/radius from `[data-department]` is visibly distinct per door.
- Arabic text renders in Noto Naskh Arabic (not a system-font fallback) —
  confirms the next/font wiring in `layout.tsx` actually took effect.
- `/admin/*` intentionally still shows the storefront header/footer (see
  its own TODO comment in `admin/layout.tsx`) — **not a bug to log here.**

## Route × locale

| Route | en | ar | Notes |
|---|---|---|---|
| `/` | ☐ | ☐ | |
| `/women` | ☐ | ☐ | |
| `/men` | ☐ | ☐ | |
| `/kids` | ☐ | ☐ | |
| `/product/[id]` | ☐ | ☐ | |
| `/cart` | ☐ | ☐ | |
| `/checkout` | ☐ | ☐ | |
| `/account` | ☐ | ☐ | |
| `/orders` | ☐ | ☐ | |
| `/orders/[id]` | ☐ | ☐ | |
| `/login` | ☐ | ☐ | |
| `/register` | ☐ | ☐ | |
| `/admin` | ☐ | ☐ | |
| `/admin/products` | ☐ | ☐ | |
| `/admin/products/new` | ☐ | ☐ | |
| `/admin/products/[id]` | ☐ | ☐ | |
| `/admin/orders` | ☐ | ☐ | |

## Known issues fixed during this pass

- **Fonts never loaded** — `globals.css` declared `--font-sans`/`--font-serif`/
  `--font-arabic` but nothing actually loaded Inter/Playfair Display/Noto
  Naskh Arabic, so the department heading-font distinction and Arabic
  script were untestable. Fixed via `next/font/google` in
  `app/[locale]/layout.tsx` (see its `inter`/`playfair`/`notoNaskhArabic`
  consts) + the `--font-*` chains in `globals.css` now referencing those
  CSS variables first.
- **Dark mode removed** — `globals.css` no longer defines `[data-theme='dark']`
  or a `prefers-color-scheme` block; `theme-provider.tsx`/`theme-toggle.tsx`
  and the header's theme toggle button were deleted. Light mode is the only
  mode, by design.
