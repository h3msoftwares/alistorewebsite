# SEO & GEO

**Production domain: `https://alistore.clothing`** — every canonical tag,
sitemap URL, robots.txt directive, Open Graph URL, and structured-data
`url`/`@id` on the live site resolves against this domain. Nothing else.

## Architecture: one source of truth

`frontend/src/lib/site.ts` exports `getSiteUrl()` — reads
`NEXT_PUBLIC_SITE_URL`, falls back to `http://localhost:3000` so local dev
and CI never need it set. Production **must** set it:

```
NEXT_PUBLIC_SITE_URL=https://alistore.clothing
```

(Netlify: Site configuration → Environment variables. No trailing slash.)

Every URL-producing piece of SEO code goes through `absoluteUrl(path)` (also
in `lib/site.ts`), which joins a site-relative path onto `getSiteUrl()`. That
means a canonical tag, its page's sitemap entry, and its own JSON-LD `url`
can never independently drift onto a different host — change the env var
once and all three move together.

`lib/site.ts` also holds `DEFAULT_BRAND_NAME_EN/AR`, `SITE_DESCRIPTION_EN/AR`,
and `DEFAULT_OG_IMAGE_PATH` (the static header logo, `/ali-store-A-traced.png`
— used as the Organization logo and the fallback OG/Twitter image when a page
has no more specific image of its own).

## Metadata

- **Root layout** (`app/[locale]/layout.tsx`): `metadataBase` (from
  `getSiteUrl()`), a title template (`%s | <brand>`, brand read live from
  `GET /api/settings`), default description, default `robots: {index, follow:
  true}`, default Open Graph/Twitter. Deliberately does **not** set
  `alternates.canonical` — a layout-level canonical would inherit onto every
  child page that doesn't set its own, wrongly canonicalizing all of them to
  the locale root. Each indexable page below sets its own instead.
- **Home** (`app/[locale]/page.tsx`): brand-first title (`title.absolute`,
  opts out of the template — the homepage is the brand's entry point, not a
  product/category the template's `%s | brand` ordering suits), canonical,
  hreflang.
- **Product** (`app/[locale]/product/[id]/page.tsx`): title/description from
  real product data, canonical (bare URL — `?color=&size=` are deep-link
  conveniences, not distinct products), hreflang, OG image from the
  product's own first photo.
- **Category** (`category/[slug]/page.tsx`) / **Collection**
  (`[collection]/page.tsx`): same pattern, from the category/collection's own
  `nameEn/Ar` and `descriptionEn/Ar`.
- Everything else (privacy, our-story, delivery-returns, auth forms, ...)
  keeps whatever it already had — no canonical of its own, which is fine
  (Google treats a page with none as self-canonical) rather than inheriting
  a wrong one.

## Structured data (`lib/structured-data.ts` + `components/seo/json-ld.tsx`)

Every builder only emits fields that are genuinely present — nothing
fabricated:

| Type | Where | Notes |
|---|---|---|
| `Organization` | root layout, once site-wide | `sameAs` only for Instagram/Facebook/TikTok URLs actually set in admin settings; `email`/`telephone` only if set. All three are currently empty on the live site (fresh DB) — the JSON-LD reflects that (fields simply absent), not a placeholder. |
| `WebSite` | root layout, once site-wide | No `SearchAction` — the storefront's search is a client-side drawer overlay with no indexable results URL to point one at; fabricating one would be fake functionality. |
| `Product` | product page | Real `sku`, `name`, `description`, `image[]`, `offers.price` (`effectivePrice` if on sale, else `price`), `offers.priceCurrency: 'USD'` (the app's one and only currency throughout — `formatCurrency`'s default, orders, everywhere), `offers.availability` computed from summed real variant `stockQuantity`. **No `brand`** — `Product` has no brand field in this data model at all, so it's omitted rather than assumed. **No reviews/ratings** — none exist anywhere in the schema. |
| `BreadcrumbList` | product, category, collection pages | Matches the visible `<Breadcrumb>` exactly — same category-ancestor chain, same names. |
| `ItemList` | category, collection pages | The real first screenful of products the page actually fetched server-side for this purpose (category: first 24 via `listCategoryProducts`; collection: first 24 of `listCollectionProducts`) — genuine visible content and order, not a separate/fabricated listing. |

## Sitemap (`app/sitemap.ts`)

Dynamic, `revalidate = 3600` (regenerates at most hourly). Includes, both
locales:

- Homepage, `/our-story`, `/delivery-returns`, `/privacy`
- Every category (`listCategories()`)
- Every collection (`listCollections()`)
- Every product (`listProducts()`, paged through in 60s — the backend's own
  max page size — up to a 200-page defensive ceiling), with a real
  `lastModified` from the product's own `lastEdit`

None of these calls pass `status`/`includeInactive` — this route runs with
no admin session, so the backend's own `resolveListStatus` (see
`backend/src/modules/catalog/list-access.ts`) already narrows every one of
them to the storefront-visible (`active`) set. Nothing archived/hidden ends
up in the sitemap by construction, not by a separate client-side filter that
could drift out of sync with it.

Cart/checkout/login/register/account/orders/admin/favourites/the auth-token
pages/`ali-admin-login`/`drive-connect-result`/`dev/ui` are not included —
see Indexing strategy below.

If the backend is unreachable when the sitemap regenerates, each section
(categories/collections/products) degrades independently — the sitemap still
ships with whatever it already has, just missing that one section until the
next `revalidate`.

## robots.txt (`app/robots.ts`)

`Allow: /` for everything, explicit `Disallow` for the same private-path list
noindex uses below (each locale-prefixed: `/en/admin`, `/ar/admin`, ...),
`Sitemap: https://alistore.clothing/sitemap.xml`. No product/category pages,
images, CSS, or JS are blocked.

## Indexing strategy: noindex via `X-Robots-Tag`, not per-page metadata

Private/duplicate/non-valuable routes — `/admin/**`, `/cart`, `/checkout`,
`/login`, `/register`, `/account`, `/orders/**`, `/favourites`,
`/forgot-password`, `/reset-password`, `/verify-email`,
`/confirm-email-change`, `/ali-admin-login`, `/drive-connect-result`,
`/dev/ui` — get an `X-Robots-Tag: noindex, nofollow` HTTP header, set in
`next.config.mjs`'s `headers()` for each locale-prefixed path (kept in sync
by hand with `app/robots.ts`'s `PRIVATE_PATHS` — that file runs through
Next's own bundling and can import from `src/lib`; `next.config.mjs` is
loaded directly by plain Node and can't).

This was a deliberate choice over adding `metadata`/`generateMetadata`
`robots: {index: false}` to each of those ~20 page files individually: most
of them are `'use client'` components, and Next's Metadata API only accepts
route-segment config (including `robots`) from a Server Component — meaning
per-page noindex would have required splitting every one of those files into
a thin server wrapper + the existing client content (the same restructuring
already done, earlier in this project, for the handful of admin pages that
needed `force-dynamic` for an unrelated build-timeout fix). An HTTP header
achieves the identical, Google-documented noindex result regardless of
component type, with zero page restructuring and zero risk to existing
client-side behaviour. `robots.txt`'s `Disallow` is defence in depth
alongside it, not a substitute — a disallowed-but-linked-from-elsewhere URL
can still get indexed by URL alone without ever being crawled, which only
the header actually prevents.

`/ali-admin-login` additionally sets `robots: {index: false, follow: false}`
directly in its own metadata (it already did, before this work) — redundant
with the header now, harmless.

**INDEX**: homepage, every category, every collection, every product,
`/our-story`, `/delivery-returns`, `/privacy` (both locales).

**NOINDEX**: the private-path list above.

**No filter/sort/pagination URLs exist to worry about** — category and
collection product listings use client-side-only state (a Redux slice), never
reflected in the URL, so there are no `?page=`/`?color=`/`?sort=` variants for
a crawler to ever discover as separate URLs. The one real query param in
practice is `/product/[id]?color=&size=` (a deep-link convenience); its
canonical points at the bare URL. There is also no indexable search-results
page — search is a client-side drawer overlay, not a crawlable route.

## 404s

Both the product page and the category page previously returned an HTTP 200
with a "not found" empty-state UI for a genuinely missing product/category —
a soft 404 with no `noindex` signal at all, which search engines could index
as real content. Both now call Next's `notFound()` for a *confirmed* 404
(fetch returned a real 404 from the backend). A fetch that merely times out
(backend slow/unreachable) does **not** trigger this — see each page's
`loadProduct`/`loadCategory` for why: a transient failure wrongly 404'ing a
real, live page would be worse than the pre-existing behaviour.

**Verified against the live backend** (a genuinely nonexistent product/
category ID, both returning the real `not-found.tsx` UI): the *response
body* is correct, but the *HTTP status stays 200*, not 404 — confirmed via
`curl`, not assumed. This is a Next.js 16 architectural constraint
(`node_modules/next/dist/docs/.../functions/not-found.md`, "Cache
Components"): a dynamic route streams its shell — already committed to a
`200` — before the `notFound()` call deep in the tree resolves, and a
response's status can't change after streaming starts. Next compensates by
auto-injecting `<meta name="robots" content="noindex">` specifically for
this case — also confirmed present in the actual response — which is what
actually keeps the page out of the index; combined with the site-wide
`index, follow` default, crawlers take the more restrictive of the two
directives. Getting a true `404` status too would mean moving the existence
check into `proxy.ts` (per Next's own docs) — a third fetch of the same
resource on every product/category request (proxy check, this page's
metadata/JSON-LD fetch, the client component's own fetch), for a gain
(status code purity) the `noindex` tag already delivers in practice; not
implemented, flagged here instead of silently claimed.

The catch-all (`app/[locale]/[...rest]/page.tsx`) already handled arbitrary
unmatched URLs before this work and is unchanged — same status-code caveat
applies there too, for the same Next 16 reason, not something introduced by
this pass.

## Multilingual SEO

`en`/`ar` routing already existed (`proxy.ts`, Next 16's renamed middleware)
before this work and is unchanged. What's new: `alternates.languages` on
home/product/category/collection pages, pointing each locale at its own real
URL for the same entity (same product/category/collection id or slug, just a
different `/en/`↔`/ar/` prefix) — not introduced site-wide, since most
secondary pages don't have their own per-page metadata to attach it to yet
(see the "everything else" line under Metadata above). `<html lang dir>` was
already set correctly per locale; not touched.

## Environment variables

| Var | Where | Required in production |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Netlify (frontend) | **Yes** — `https://alistore.clothing`, no trailing slash |

## Domain verification performed

Searched the frontend source tree for `example.com`, `localhost`, and any
prior domain — the only matches were mock URLs inside test files (never
executed in production). No SEO-relevant code referenced a wrong domain
before this work, so there was nothing to fix there beyond adding the real
one.

## What this doesn't cover (needs real business decisions, not code)

- **Product URLs are ID-based** (`/product/<uuid>`), not slugged
  (`/product/black-oversized-hoodie`) — `Product` has no `slug` field in the
  data model at all (`Category`/`Collection` do). Flagged, not changed: a
  slug migration needs backend schema work (a new column, a generation/
  uniqueness strategy) and redirects for every already-shared product link —
  a product decision, not something to change silently as part of an SEO
  pass.
- **LocalBusiness/ClothingStore structured data**: not implemented. The data
  model supports it (`SiteSettings.storeLocations`, each with
  address/hours/map URL), but the live site currently has zero store
  locations configured (confirmed against the production database) — there
  is nothing real to put in it yet. Add it once at least one location is
  configured in the admin panel's "Visit us" settings.
- **Social profile URLs, contact email/phone**: same story — the fields
  exist and `Organization` JSON-LD already reads them live, but they're
  currently unset on the production site. They'll appear automatically the
  moment an admin fills them in; nothing further to build.
- **Product images without dedicated alt text**: spot-checked, not
  exhaustively audited image-by-image — `next/image` is used throughout with
  real `altEn`/`altAr` fields (falling back to the product/category name),
  no keyword-stuffed or missing-alt pattern found in the components this
  pass touched, but a full image-by-image audit across the whole product
  catalog wasn't performed.

## Post-launch checklist (after deploying to `https://alistore.clothing`)

1. **Google Search Console**: Add the property (`https://alistore.clothing`)
   → verify ownership (DNS TXT record is usually simplest for an apex domain
   — Search Console's own instructions will give you the exact record once
   you start adding the property).
2. Submit the sitemap: Search Console → Sitemaps → enter `sitemap.xml`
   (resolves to `https://alistore.clothing/sitemap.xml`).
3. Request indexing for the homepage and a few flagship
   category/product pages via Search Console's URL Inspection tool — don't
   wait for organic discovery on day one.
4. Spot-check `https://alistore.clothing/robots.txt` and
   `https://alistore.clothing/sitemap.xml` actually resolve correctly on the
   real domain (not just the Netlify preview URL) once DNS/hosting is live.
5. Once `NEXT_PUBLIC_SITE_URL` is set on Netlify, redeploy and re-verify a
   product page's `view-source` shows `https://alistore.clothing/...` in its
   canonical/OG tags/JSON-LD, not the Netlify preview domain.
6. If store locations, social profiles, or contact info get filled in later,
   nothing further to build — `Organization`/`LocalBusiness` structured data
   is already wired to pick them up live (see "What this doesn't cover"
   above for the LocalBusiness piece specifically).
