# Security

Ali's Store is a Cash-on-Delivery storefront (Next.js frontend, Node/Express +
Prisma/PostgreSQL backend). This file is the entry point for the security
documentation; the detail lives under [`security/`](./security/).

| Document | Covers |
| --- | --- |
| [`security/auth-model.md`](./security/auth-model.md) | Authentication & session model, the per-endpoint rate-limit table, what `AuditLog` records and why (**S7**). |
| [`security/operations.md`](./security/operations.md) | Secret inventory & rotation plan, backup verification, admin-credential handoff (**S5**). |
| [`security/pentest-checklist.md`](./security/pentest-checklist.md) | What has been tested and how, plus the pre-go-live checklist (**S6**). |
| [`security/owasp-top-10.md`](./security/owasp-top-10.md) | OWASP Top 10 (2021) coverage map, mitigation-by-mitigation (**S8**). |

## Reporting a vulnerability

This is a private project. Report suspected vulnerabilities directly to the
repository owner (see the GitHub repo's admin) — do not open a public issue.

## Security-relevant controls at a glance

- **Transport / headers** — `helmet` on the API (`default-src 'none'` CSP,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS in production);
  a restrictive CSP + HSTS + `nosniff` + `Referrer-Policy` +
  `Permissions-Policy` on the frontend via `next.config.mjs`.
- **Auth** — Argon2id password hashing, short-lived access JWTs (15 min
  customer / 5 min staff-admin) held only in memory, httpOnly `SameSite=Strict`
  refresh cookie with rotation + reuse-detection, a separate unguessable
  admin-login path, per-account lockout, uniform "invalid credentials"
  responses.
- **Step-up auth (S2)** — order-status changes and stock edits require a
  password re-entry within the last 10 minutes (`auth_time` claim, not reset by
  silent refresh).
- **CSRF** — double-submit cookie + `X-CSRF-Token` header on every
  state-changing request.
- **Abuse** — per-IP and per-identifier rate limits on every auth and
  order-lookup route; hCaptcha + email OTP + IP/phone/email blocklist +
  order-velocity flagging at checkout.
- **Input** — Zod validation on every route body/query/params; a global
  sanitiser strips control chars / markup / prototype-pollution keys; Prisma
  parameterises all SQL.
- **Audit** — append-only `AuditLog` for auth attempts, step-up attempts, and
  every admin order/stock mutation.
