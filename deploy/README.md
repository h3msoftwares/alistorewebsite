# VPS deployment (migration target)

The app runs today on Vercel + Railway/Fly + Neon. This directory is the
bring-up for the "small always-on VPS" target from the production-readiness
audit (`docs/PRODUCTION-READINESS-AUDIT.md`).

**Measured shape (see the audit):** the API is CPU-bound and saturates a single
vCPU at ~30 req/s sustained; RAM stays well under 500 MB; Postgres is not the
bottleneck. So: 1 vCPU / 1 GB is enough for the stated "moderate online
traffic", with the first upgrade being **vCPU** (not RAM, not disk) once
sustained traffic approaches ~20 req/s.

## Topology

```
Internet ──HTTPS:443──▶ Nginx ──▶ 127.0.0.1:4000 (Express, systemd) ──▶ Postgres (Neon, remote)
```

Only 22/80/443 are open. Express binds loopback only. Postgres is remote
(Neon) — no local 5432.

## One-time setup (Ubuntu 22.04/24.04)

```bash
# 1. user + code
sudo adduser --system --group --home /srv/alistore deploy
sudo -u deploy git clone <repo> /srv/alistore
cd /srv/alistore/backend

# 2. Node 20 (nvm for the deploy user, or NodeSource)
#    ensure `node` is Node 20:  node -v

# 3. env — production values, NOT committed
sudo mkdir -p /etc/alistore
sudo cp backend/.env.example /etc/alistore/api.env
sudo $EDITOR /etc/alistore/api.env      # real secrets; set NODE_ENV=production
#   also add:  NODE_OPTIONS=--max-old-space-size=768
#              RATE_LIMIT_MAX=300            (raise transiently for a known spike)
sudo chmod 600 /etc/alistore/api.env && sudo chown deploy:deploy /etc/alistore/api.env

# 4. build
sudo -u deploy bash -lc 'cd /srv/alistore/backend && npm ci && npm run build'

# 5. services
sudo cp deploy/systemd/alistore-api.service /etc/systemd/system/
sudo cp deploy/nginx/alistore.conf     /etc/nginx/sites-available/alistore
sudo cp deploy/nginx/alistore-proxy.conf /etc/nginx/snippets/
sudo cp deploy/logrotate/alistore      /etc/logrotate.d/alistore
sudo ln -s /etc/nginx/sites-available/alistore /etc/nginx/sites-enabled/
sudo systemctl daemon-reload
sudo systemctl enable --now alistore-api
sudo nginx -t && sudo systemctl reload nginx

# 6. TLS
sudo certbot --nginx -d api.your-domain.com

# 7. firewall — see deploy/firewall.md
```

## Deploy a new version

```bash
sudo -u deploy bash -lc 'cd /srv/alistore && git pull && cd backend && npm ci && npm run build'
sudo systemctl restart alistore-api      # ExecStartPre runs `prisma migrate deploy`
curl -fsS https://api.your-domain.com/health
```

## Reboot behaviour

`systemctl enable` on `alistore-api` + Nginx means both start on boot with no
manual step. `ExecStartPre` re-applies migrations (idempotent). Verify after a
reboot: `systemctl is-active alistore-api nginx && curl -fsS localhost:4000/health`.

## Rollback

`git checkout <previous-sha>` in `/srv/alistore`, `npm ci && npm run build`,
`systemctl restart alistore-api`. Migrations are forward-only — a rollback that
must also revert a schema change needs a new down-migration; coordinate with
the DB.

## Docker alternative

`backend/Dockerfile` (after the audit's hardening) + a compose file with
`deploy.resources.limits` can replace steps 4–5. On a 1 GB box the systemd +
Node path has less overhead and is preferred; Docker is worth it only if you
already run other containers on the host.
