# Ali's Store — Frontend Blueprint

Next.js (App Router) + TypeScript blueprint. Pages are intentionally empty
(`TODO` placeholders) — the one thing actually implemented is the shared
design system, so every page you build will already be visually consistent.

## What's implemented

- **Data layer** (fully wired, tested):
  - `src/lib/types.ts` — hand-written domain + API types mirroring the
    finalized backend Prisma schema, plus write-payload types.
  - `src/lib/api/` — typed fetch client + per-resource modules
    (`authApi`, `catalogApi`, `cartApi`, `ordersApi`, `accountApi`).
    The client injects the bearer token, sends cookies, and on a `401`
    silently hits `POST /api/auth/refresh` once and replays the request;
    non-2xx responses throw a typed `ApiError` (`status` / `code` / `issues`).
  - `src/hooks/` — TanStack Query hooks over the api modules: `useCollections`,
    `useProducts`, `useProduct`, `useCart` (+ `useAddToCart` etc.),
    `useMyOrders` / `useCheckout` / `useCancelOrder`, `useAddresses`,
    `useProfile`, `useLogin` / `useRegister` / `useLogout` /
    `useAuthBootstrap`, plus the admin CRUD mutations. `src/lib/query-keys.ts`
    is the shared key factory used for invalidation.
  - `src/store/` — Redux Toolkit: `authSlice` (who's signed in — the access
    token itself lives in `src/lib/api/token.ts`), `cartSlice` (header badge
    count, kept in sync by `useCart`), `uiFiltersSlice` (product-list query
    state + `selectProductListQuery` selector). `store/provider.tsx` owns the
    store + `QueryClient` singletons and runs `useAuthBootstrap` once.
  - `src/lib/collections.ts` — the three fixed storefront doors
    (Women/Men/Kids) as slug-keyed `Collection` references.
- **Tests** — `npm test` (Vitest + Testing Library + jsdom). 56 tests: slice
  reducers/selectors, the api client (query building, auth header, `ApiError`,
  the 401→refresh→retry path), and every hook (mocked api modules, Redux +
  Query wrapper in `src/test/utils.tsx`).
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
- **Site structure** (layout scaffolding — no data wired yet):
  - `src/components/site-header.tsx` composes `chrome/offers-strip.tsx`
    (rotating, dismissible promo strip) + `chrome/topbar.tsx` (logo ·
    collection switcher · **search / favourites / cart / account-or-login** ·
    language). Search opens `chrome/search-overlay.tsx`.
  - `src/app/[locale]/page.tsx` = `home/hero.tsx` (eyebrow · headline ·
    Discover CTA · image) + `home/collections-showcase.tsx`, which renders one
    `home/collection-section.tsx` per collection (name + `View all` + a grid of
    `home/category-card.tsx`), each block on its own background
    (`data-surface="bg|surface|tint"`) so the collections read as separate.
  - `store/slices/favouritesSlice.ts` backs the topbar favourites badge and
    the `/favourites` route (placeholder).
- `site-footer.tsx` — multi-column footer + newsletter stub.
- `src/app/[locale]/{loading,error,not-found}.tsx` + `admin/{loading,error}.tsx`
  — route-level skeleton / retry / 404 states.
- `src/proxy.ts` — redirects `/` to `/en` (swap for Accept-Language
  detection later if you want). Next's `middleware.ts` convention is
  deprecated in favor of `proxy.ts` as of this Next version.
- `src/app/[locale]/layout.tsx` — sets `<html lang dir>` per locale (en/ar)
  and wires in the header/footer + Redux store provider.

## What's empty (TODO)

The home page has real structure (hero + collection blocks) but static
placeholder content. Every other page under `src/app/[locale]/**` renders
`<PagePlaceholder>` only — collection listings, product detail, cart,
checkout, orders, account, favourites, login/register, and the whole
`/admin` subtree. Each file has a one-line comment describing what it needs
to call once you fill it in (the hooks in `src/hooks/`).

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev        # http://localhost:3000 -> redirects to /en
npm test           # Vitest (unit + hook tests)
npm run typecheck  # tsc --noEmit
```

## Design system usage

Wrap a page's root element with `data-collection="women" | "men" | "kids"`
(the storefront collection slug) to apply that door's accent
color/radius/heading font — see `page.tsx` (landing doors) and
`women/page.tsx` for examples. Everything else (spacing, buttons `.btn`,
cards `.card`, inputs `.input`) is shared automatically. Light mode only —
there is no dark mode/theme toggle.
