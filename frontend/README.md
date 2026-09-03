# Ali's Store — Frontend Blueprint

Next.js (App Router) + TypeScript blueprint. Pages are intentionally empty
(`TODO` placeholders) — the one thing actually implemented is the shared
design system, so every page you build will already be visually consistent.

## What's implemented

- `src/lib/types.ts` — hand-written domain + API types mirroring the
  finalized backend Prisma schema (Collection → Category → Product, Cart,
  Order with delivery snapshot, etc.). `src/lib/api.ts` — thin typed fetch
  helpers (`getCollections`, `getProducts`, `getCart`, …).
  `src/lib/collections.ts` — the three fixed storefront doors
  (Women/Men/Kids) as slug-keyed `Collection` references.
- `src/styles/globals.css` — the full design system: light-mode-only
  tokens (no dark mode — deliberately not wanted), RTL-ready logical
  properties, responsive breakpoints, and the "compound" per-collection
  accent system (`data-collection="women|men|kids"` on a page's root wrapper).
  Spec + rationale:
  [`docs/design-system.md`](docs/design-system.md); QA matrix:
  [`docs/design-system-verification.md`](docs/design-system-verification.md).
- `src/components/ui/*` — typed wrappers over the `globals.css` classes:
  `Button`, `Icon` (lucide-react), `Field`/`Input`/`Select`/`Textarea`/`Choice`,
  `SizeChip`, `Swatch`, `QuantityStepper`, `Badge`, `StatusPill`, `PriceTag`,
  `ProductCard`, `DataTable`, `Skeleton`, `EmptyState`, `Alert`, `Drawer`.
  Live showcase (dev only): `/en/dev/ui`.
- `src/components/site-header.tsx` + `site-footer.tsx` — shared chrome
  (logo, collection switcher, language toggle, Lucide search/account/cart
  icons, cart-count badge, off-canvas mobile menu) rendered by the root
  layout, so it's identical on every page.
- `src/app/[locale]/{loading,error,not-found}.tsx` + `admin/{loading,error}.tsx`
  — route-level skeleton / retry / 404 states.
- `src/proxy.ts` — redirects `/` to `/en` (swap for Accept-Language
  detection later if you want). Next's `middleware.ts` convention is
  deprecated in favor of `proxy.ts` as of this Next version.
- `src/app/[locale]/layout.tsx` — sets `<html lang dir>` per locale (en/ar)
  and wires in the header/footer + Redux store provider.

## What's empty (TODO)

Every page under `src/app/[locale]/**` renders `<PagePlaceholder>` only —
landing "doors", collection listings, product detail, cart, checkout,
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

Wrap a page's root element with `data-collection="women" | "men" | "kids"`
(the storefront collection slug) to apply that door's accent
color/radius/heading font — see `page.tsx` (landing doors) and
`women/page.tsx` for examples. Everything else (spacing, buttons `.btn`,
cards `.card`, inputs `.input`) is shared automatically. Light mode only —
there is no dark mode/theme toggle.
