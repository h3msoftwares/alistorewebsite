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

# postgresql-client — pg_dump for the admin-triggered database backup
# (modules/backup), matching the postgres:16 used everywhere else.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
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
