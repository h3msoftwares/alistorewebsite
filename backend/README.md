# Ali's Store — Backend API

Express + TypeScript + Prisma (PostgreSQL) REST API for Ali's Store.
Adapted from the original pos-backend project: same module conventions
(vertical-slice modules, Zod validation, AppError + centralized error
handler, JWT access/refresh auth), with Redis removed — refresh tokens are
stored (hashed) in Postgres instead, since nothing in this project needs a
cache or session store at this scale. See the project guide PDF for why.

## Modules

- `auth` — register, login, refresh, logout (JWT access + DB-backed refresh tokens)
- `catalog` — categories (per department) and products (list/filter/detail + admin CRUD)
- `cart` — guest (cookie session) and logged-in cart, merges on login
- `orders` — checkout (COD only), order history, cancel, admin status updates
- `admin` — staff/admin-only routes: order management, stock updates, dashboard

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
- `Department` (WOMEN / MEN / KIDS) is on both `Category` and `Product` so the storefront can query "everything in this door" directly.
- No shipping-fee/zone logic — delivery is handled by the store owner outside the app, per the SRS.
