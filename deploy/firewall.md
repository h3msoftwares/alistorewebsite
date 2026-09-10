# Firewall (ufw)

The API is loopback-only; Postgres is remote (Neon). Nothing but SSH + HTTP(S)
should be reachable from the internet.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp        # SSH — restrict to your IP if you have a static one:
#   sudo ufw allow from <your.ip.addr> to any port 22 proto tcp
sudo ufw allow 80/tcp        # HTTP (redirect + ACME)
sudo ufw allow 443/tcp       # HTTPS
sudo ufw enable
sudo ufw status verbose
```

Verify Express is not publicly bound:

```bash
sudo ss -tlnp | grep 4000
# expect  127.0.0.1:4000  (NOT 0.0.0.0:4000 / :::4000)
```

`backend/src/server.ts` calls `app.listen(env.PORT)` with no host arg, which
binds all interfaces. On the VPS, set `HOST=127.0.0.1` and have the server pass
it (small change), or rely on ufw to block :4000 from outside — ufw is the
backstop, loopback binding is the belt.

Outbound: the app needs 443 to Neon, ImageKit, hCaptcha, GA4, and the SMTP
port (587/465) to your relay. `default allow outgoing` covers it; tighten only
if your threat model needs egress filtering.
