# Ali's Store — Frontend Blueprint

Next.js (App Router) + TypeScript blueprint. Pages are intentionally empty
(`TODO` placeholders) — the one thing actually implemented is the shared
design system, so every page you build will already be visually consistent.

## What's implemented

- `src/styles/globals.css` — the full design system: light/dark tokens,
  RTL-ready logical properties, responsive breakpoints, and the "compound"
  per-department accent system (`data-department="women|men|kids"`).
- `src/components/theme-provider.tsx` + `theme-toggle.tsx` — working
  light/dark/system mode switch, persisted in localStorage.
- `src/components/site-header.tsx` + `site-footer.tsx` — shared chrome
  (logo, department switcher, theme + language toggle, cart icon) rendered
  by the root layout, so it's identical on every page.
- `middleware.ts` — redirects `/` to `/en` (swap for Accept-Language
  detection later if you want).
- `src/app/[locale]/layout.tsx` — sets `<html lang dir>` per locale (en/ar)
  and wires in the theme provider + header/footer.

## What's empty (TODO)

Every page under `src/app/[locale]/**` renders `<PagePlaceholder>` only —
landing "doors", department listings, product detail, cart, checkout,
orders, account, login/register, and the whole `/admin` subtree. Each file
has a one-line comment describing what it needs to call once you fill it
in — they all point at the backend's REST endpoints in `../backend`.

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev   # http://localhost:3000 -> redirects to /en
```

## Design system usage

Wrap a page's root element with `data-department="women" | "men" | "kids"`
to apply that door's accent color/radius/heading font — see
`page.tsx` (landing doors) and `women/page.tsx` for examples. Everything
else (spacing, buttons `.btn`, cards `.card`, inputs `.input`) is shared
and theme-aware automatically.
