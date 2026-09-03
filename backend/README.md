# Ali's Store — Backend API

Express + TypeScript + Prisma (PostgreSQL) REST API for Ali's Store.
Adapted from the original pos-backend project: same module conventions
(vertical-slice modules, Zod validation, AppError + centralized error
handler, JWT access/refresh auth), with Redis removed — refresh tokens are
stored (hashed) in Postgres instead, since nothing in this project needs a
cache or session store at this scale. See the project guide PDF for why.

## Modules

- `auth` — register, login (with account lockout), refresh (with rotation + reuse detection), logout; merges the guest cart on sign-in
- `catalog` — `collection`, `category`, `product` — full CRUD, each with an image sub-resource; products also have a variant sub-resource
- `cart` — guest (cookie session) and logged-in cart; add / update / remove / clear; merges on login
- `orders` — checkout (COD only), order history, detail, cancel (restocks); admin status / mark-collected / dashboard
- `account` — `address` CRUD (per user, default handling) and `user` profile (`GET`/`PATCH /api/users/me`)
- `admin` — staff/admin-only: order management, per-variant stock updates, dashboard

### API surface

| Method | Path | Access |
|---|---|---|
| GET | `/api/collections` · `/api/collections/:id` · `/api/collections/slug/:slug` | public |
| POST/PATCH/DELETE | `/api/collections` · `/api/collections/:id` | STAFF/ADMIN |
| POST | `/api/collections/:id/categories` (link) | STAFF/ADMIN |
| POST/PATCH/DELETE | `/api/collections/:id/images[/:imageId]` | STAFF/ADMIN |
| GET | `/api/categories` (`?collectionId=`) · `/api/categories/:id` | public |
| POST/PATCH/DELETE | `/api/categories/:id` + `/images[/:imageId]` | STAFF/ADMIN |
| GET | `/api/products` (filters + pagination) · `/api/products/:id` | public |
| POST/PATCH/DELETE | `/api/products/:id` + `/variants[/:variantId]` + `/images[/:imageId]` | STAFF/ADMIN |
| GET/POST/PATCH/DELETE | `/api/cart` · `/api/cart/items[/:itemId]` | guest or user |
| POST | `/api/orders/checkout` | guest or user |
| GET | `/api/orders/mine` · `/api/orders/:id` · POST `/api/orders/:id/cancel` | user |
| GET/POST/PATCH/DELETE | `/api/addresses[/:id]` | user |
| GET/PATCH | `/api/users/me` | user |
| GET | `/api/admin/dashboard` · `/api/admin/orders` (`?status=`) | STAFF/ADMIN |
| PATCH | `/api/admin/orders/:id/status` · `/collected` · `/api/admin/variants/:variantId/stock` | STAFF/ADMIN |

## Testing

Integration tests (Vitest + Supertest) run against a dedicated **`alistore_test`**
database on the same Postgres server. `tests/helpers/global-setup.ts` creates it
if missing and runs `prisma migrate deploy`; every test starts from a truncated
DB. `vitest.config.mts` injects `NODE_ENV=test` + the test `DATABASE_URL`, so a
local `.env` can't point tests at the dev database. `npm test` needs the Postgres
container up (`docker compose up -d postgres`).

## Local setup

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate     # creates tables from prisma/schema.prisma
npm run seed                # admin user + sample bilingual catalog
npm run dev                  # http://localhost:4000
```

Default seeded admin: `admin@alistore.com` / `ChangeMe123!` — change this
before going live.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start with hot reload |
| `npm run build` / `npm start` | Production build + run |
| `npm run prisma:studio` | Browse the DB visually |
| `npm test` | Run unit + integration tests (Vitest) |

## Notes

- All money fields are `Decimal(12,2)`.
- Products/orders use soft delete (`deletedAt`) so past order history stays intact even if a product is later removed.
- `Collection` is an owner-editable table (replaces the old fixed `Department` enum). Hierarchy is `Collection -> Category -> Product`; `collectionID` is denormalized onto `Product` too so the storefront can query "everything in this collection" directly. Admin CRUD lives at `/api/collections` (and `POST /api/collections/:id/categories` to link existing categories).
- `Collection` and `Category` each have a gallery image table (`CollectionImage` / `CategoryImage`) modelled exactly on `ProductImage` — `url` + bilingual alt + `sortOrder`, cascade-deleted with the parent. The "base" image is the lowest-`sortOrder` row; reads order `images` ascending like products do.
- No shipping-fee/zone logic — delivery is handled by the store owner outside the app, per the SRS.
- `Cart` is one row per user (`userID` unique) or guest session (`sessionID` unique); `CartItem` hangs off `cartID`. Guest→user merge on login re-points / merges the single `Cart` row.
- `Order` stores a **delivery snapshot** (`deliveryName/Phone/Address/City/Area/Notes`) captured at order time, so editing a saved `Address` later never changes order history. `OrderItem` snapshots `productSKU`, `variantSKU`, `productImageUrl` and `lineTotal` on top of name/size/color/price.
- `ProductVariant.size` / `color` are nullable (one-size / no-colour products). The DB no longer has a `(productID,size,color)` unique constraint — duplicate-variant prevention is enforced in application code.
- `StockMovement` is an append-only stock ledger: checkout writes a `SALE` row per line, manual admin stock edits write an `ADJUSTMENT` row (with the acting user). `ProductVariant.stockQuantity` stays the materialized current value.
- `RefreshToken` rows carry a `familyID` (rotation chain) and `replacedByTokenID`. On refresh, presenting an already-rotated token is treated as replay and revokes the whole family.
- Schema also has the tables for **account lockout** (`User.failedLoginAttempts` / `lockedUntil`), **password reset** (`PasswordResetToken`), **Google login** (`OAuthAccount` + `User.emailVerified`) and a generic **`AuditLog`** — the columns exist; the flows that use them are not wired up yet.
