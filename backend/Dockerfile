# Multi-stage: a fat build stage, a slim runtime with prod deps only.
# Requires backend/.dockerignore (keeps .env + node_modules out of the context).

# ---- build ----
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build            # -> dist/src/*.js , dist/prisma/*.js

# ---- runtime ----
FROM node:20-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# postgresql-client-17 — pg_dump/pg_restore for the admin-triggered database
# backup (modules/backup), matching Supabase's Postgres 17.6. pg_dump refuses
# to dump a server NEWER than itself ("aborting because of server version
# mismatch") — confirmed live in production — so this can't be the bare
# `postgresql-client` meta-package: Debian 12's own repo only ships version
# 15, and the meta-package always tracks whatever's newest anyway (currently
# 18 upstream), neither of which is guaranteed to match Supabase. Pulls in
# the official PGDG apt repo for an explicit, pinned postgresql-client-17.
# (An earlier attempt tried adding this via nixpacks.toml instead — dead
# code, since this service actually builds via this Dockerfile, not
# Nixpacks, despite railway.json's builder setting; see that file's note.)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail \
       https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-17 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# prod dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# generated Prisma client + engine, compiled app, migrations
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma

# drop privileges (node:20-slim ships a `node` user)
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# migrate deploy is idempotent; run it on start so a fresh container is ready.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/server.js"]
