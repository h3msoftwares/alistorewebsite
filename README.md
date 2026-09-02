# Ali's Store — Getting Started

This covers running the **backend** (Express API) and **frontend** (Next.js) together
for local development. Extract `alistore-backend.zip` and `alistore-frontend.zip`
into sibling folders (`backend/` and `frontend/`) — that's the layout everything
below assumes.

```
alistore/
├── backend/
├── frontend/
└── docker-compose.yml   (included inside alistore-backend.zip)
```

## Prerequisites

- Node.js 20+
- Docker (for local Postgres) — or your own Postgres 16 instance
- npm

## 1. Database (Postgres)

From the `backend/` folder (or wherever `docker-compose.yml` ended up):

```bash
docker compose up -d postgres
```

This starts Postgres on `localhost:5432` with the credentials already wired
into `backend/.env.example` (`alistore` / `alistore` / db `alistore`).

If you'd rather use your own Postgres instance, just point `DATABASE_URL` in
`backend/.env` at it instead — nothing else changes.

## 2. Backend (Express API)

```bash
cd backend
cp .env.example .env
# open .env and set real values for JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
npm install
npm run prisma:generate
npm run prisma:migrate      # creates tables from prisma/schema.prisma
npm run seed                 # admin user + sample bilingual catalog
npm run dev                  # -> http://localhost:4000
```

Verify it's up:

```bash
curl http://localhost:4000/health
# { "status": "ok" }
```

Seeded admin login: `admin@alistore.com` / `ChangeMe123!` — **change this
before deploying anywhere real.**

## 3. Frontend (Next.js)

In a second terminal:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev                  # -> http://localhost:3000 (redirects to /en)
```

`NEXT_PUBLIC_API_URL` in `.env.local` should point at the backend
(`http://localhost:4000` by default — already set in `.env.example`).

## 4. Confirm both are talking to each other

Open `http://localhost:3000` — you should land on the "choose a department"
page. The department pages, product detail, cart, etc. are still empty
placeholders (see `frontend/README.md` for what's implemented vs. TODO) but
the API is live underneath, so any page you build against
`GET http://localhost:4000/api/products` will return the seeded catalog.

## Everyday commands, once both are running

| Task | Where | Command |
|---|---|---|
| Restart backend after a change | `backend/` | `npm run dev` (auto-restarts on save) |
| Restart frontend after a change | `frontend/` | `npm run dev` (auto-restarts on save) |
| Browse the DB visually | `backend/` | `npm run prisma:studio` |
| Re-seed the database | `backend/` | `npm run seed` |
| Run backend tests | `backend/` | `npm test` |
| Reset the DB entirely | `backend/` | `docker compose down -v && docker compose up -d postgres` then re-run migrate + seed |

## Common issues

- **`ECONNREFUSED` on `prisma migrate dev`** — Postgres isn't up yet. Run
  `docker compose ps` to check, or give it a few seconds after `docker compose up -d`.
- **Frontend loads but API calls fail (CORS)** — check `CORS_ORIGIN` in
  `backend/.env` matches the frontend's URL exactly (`http://localhost:3000`, no trailing slash).
- **401 on every request** — the access token is short-lived (15 min by
  default); make sure your frontend calls `/api/auth/refresh` before it expires
  once that flow is implemented, or just log in again during manual testing.

## Where to go next

- `Alis_Store_Project_Guide.pdf` — full architecture, DB schema, and API reference
- `Alistore_Sprint_Plan.md` — the week-by-week task breakdown for the team
- `backend/README.md` and `frontend/README.md` — deeper notes specific to each app
