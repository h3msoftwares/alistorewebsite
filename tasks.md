# Ali's Store — Module-Based Implementation Plan (Week 2 onward)

**Capacity:** 3 hrs/day × 5 days = 15 hrs/week per dev (45 hrs/week team).
**Tooling assumption:** Devs use Claude Code for implementation, so estimates below are cut ~35–40% off the original plan's hours (scaffolding, boilerplate, and test-writing are the biggest beneficiaries; security review/judgment calls are cut less).

**Team:**
- **Dev1 — Mohammad SF** — Frontend
- **Dev2 — Mohammad Kh** — Full-stack backend + testing owner
- **Dev3 — Security dev** — Auth, RBAC, session/token security, audit, vuln scanning

Week 1 (environment/foundations) is assumed complete: local Next.js + design system, Redux skeleton, Postgres/Prisma seeded, CI skeleton, auth module verified end-to-end, security headers baseline.

---

## How this plan is organized

Instead of one task list per week, work is grouped into **modules** — a module is a vertical slice (frontend + backend + security + tests) that can be built and verified largely on its own. Each module lists parallel tracks for the 3 devs. **Modules only block each other where there's a real data or auth dependency** — everything else is designed to run concurrently, so two or three modules can be in progress at once instead of waiting week-to-week.

---

## Module 1 — Catalog & Storefront Browsing
*No dependency on other Week 2+ modules — can start immediately alongside Module 2.*

| Track | Dev | Task | Est. hrs |
|---|---|---|---|
| Frontend | Dev1 | Department pages (Women/Men/Kids): category grid + listing, wired to `GET /products` via TanStack Query | 5h |
| Frontend | Dev1 | Filter UI (size, color, price, sort) driving the same endpoint's query params | 4h |
| Backend | Dev2 | Category admin CRUD endpoints (create/edit/delete) | 3h |
| Backend | Dev2 | Product image upload endpoint (admin) → Cloudinary/S3, save URLs to `ProductImage` | 3h |
| Testing | Dev2 | Integration tests: category CRUD + product filtering/sorting (all query param combos) | 3h |

**Module 1 total: ~18h** (was 30h)

---

## Module 2 — Auth Pages & Admin Login Hardening
*No dependency on Module 1 — runs fully in parallel with it.*

| Track | Dev | Task | Est. hrs |
|---|---|---|---|
| Frontend | Dev1 | Login/register pages + account/profile page (saved addresses) | 3h |
| Security | Dev3 | Separate admin login flow: stricter rate limit, route-level role check, audit-log every admin login attempt (`Log` model) | 4h |
| Security | Dev3 | Account lockout after N failed attempts (temporary) | 2.5h |
| Security | Dev3 | CSRF protection for cookie-based refresh token flow | 3h |

**Module 2 total: ~12.5h** (was 20h)

---

## Module 3 — Product Detail & Cart
*Depends on Module 1 (needs product listing/detail data + `GET /products`).*

| Track | Dev | Task | Est. hrs |
|---|---|---|---|
| Frontend | Dev1 | Product detail page: gallery, size/color picker (disables out-of-stock combos), add-to-cart | 5h |
| Frontend | Dev1 | Cart page: quantity update, remove item, subtotal, empty-state | 4h |
| Backend | Dev2 | Verify/fix guest→user cart merge on login, end-to-end | 2.5h |
| Backend | Dev2 | Concurrency test: two near-simultaneous checkouts on same low-stock variant | 3h |
| Testing | Dev2 | Integration tests: cart add/update/remove + stock-guard edge cases | 3.5h |

**Module 3 total: ~18h** (was 30h)

---

## Module 4 — Session & Cart Security
*Depends on Module 2 (CSRF/admin login foundation) and Module 3 (cart/session flows exist to secure).*

| Track | Dev | Task | Est. hrs |
|---|---|---|---|
| Security | Dev3 | Secure cart/guest-session cookie flags (httpOnly, sameSite, secure in prod) | 2h |
| Security | Dev3 | Regenerate guest session ID after cart merge on login (prevent session fixation) | 2.5h |
| Security | Dev3 | Full input-sanitization pass: review every Zod schema for missing constraints | 3h |
| Security | Dev3 | Security checklist pass #1 (OWASP Top 10 quick pass on everything shipped so far) | 2h |

**Module 4 total: ~9.5h** (was 15h) — can run in parallel with Module 5 once Modules 2–3 land.

---

## Module 5 — Checkout & Orders
*Depends on Module 3 (cart must exist).*

| Track | Dev | Task | Est. hrs |
|---|---|---|---|
| Frontend | Dev1 | Checkout page: COD form (name, phone, delivery text, notes) — React Hook Form + Zod | 4h |
| Frontend | Dev1 | Order confirmation page + order history/detail pages | 4h |
| Backend | Dev2 | Address CRUD endpoints for logged-in users | 3h |
| Testing | Dev2 | Integration test: full checkout flow (cart → order → stock decrement → cart cleared) | 3h |
| Testing | Dev2 | Order cancellation tests (pending-only rule) + order-number collision test | 2h |

**Module 5 total: ~16h** (was 25h)

---

## Module 6 — Checkout & Order Security Hardening
*Depends on Modules 2, 4, and 5 (needs checkout + session security in place).*

| Track | Dev | Task | Est. hrs |
|---|---|---|---|
| Security | Dev3 | Tighten checkout/auth rate limits; reuse-detection alert (log + revoke all sessions on replay) | 3h |
| Security | Dev3 | Audit log entries on order status changes (who changed what, when) | 2.5h |
| Security | Dev3 | Shorten admin JWT TTL + require re-login for sensitive actions (status change, stock edit) | 2.5h |

**Module 6 total: ~8h** (was 13h)

---

## Module 7 — Admin Panel
*Depends on Module 2 (admin login), Module 1 (product/category data), Module 6 (order audit log).*

| Track | Dev | Task | Est. hrs |
|---|---|---|---|
| Frontend | Dev1 | Admin dashboard (Recharts: orders, pending count, revenue) → `GET /admin/dashboard` | 3h |
| Frontend | Dev1 | Admin product management: table + create/edit form (bilingual fields, variant rows, stock) | 5.5h |
| Frontend | Dev1 | Admin order management: table, status update, "mark COD collected" toggle | 4h |
| Backend | Dev2 | Performance pass: indexes on product/order listing queries under seeded + synthetic data | 2.5h |
| Testing | Dev2 | Authorization boundary tests: STAFF vs. ADMIN on every admin route | 3h |
| Testing | Dev2 | Pagination correctness tests (product/order lists, page-boundary edge cases) | 2h |
| Security | Dev3 | RBAC boundary manual + automated tests confirming STAFF can't hit ADMIN-only actions | 2.5h |

**Module 7 total: ~22.5h** (was 36h)

---

## Module 8 — Vulnerability Scanning & Production Hardening
*Depends on Module 7 (most surface area needs to exist to scan meaningfully).*

| Track | Dev | Task | Est. hrs |
|---|---|---|---|
| Security | Dev3 | `npm audit` + OWASP ZAP baseline scan on both apps; triage and fix findings | 4.5h |
| Security | Dev3 | Production HTTPS/security headers (HSTS, CSP baseline) ahead of deploy | 2.5h |

**Module 8 total: ~7h** (was 11h)

---

## Module 9 — Cross-Cutting QA (visual, RTL, accessibility)
*Depends on all frontend modules (1, 2, 3, 5, 7) being feature-complete. Can start incrementally per page as each module finishes rather than waiting for all of them.*

| Track | Dev | Task | Est. hrs |
|---|---|---|---|
| QA | Dev1 | Cross-device/browser responsive QA pass across every page | 3h |
| QA | Dev1 | Dark/light + RTL (Arabic) QA pass across every page; fix visual breaks | 3h |
| QA | Dev1 | Accessibility pass: labels, focus states, contrast check | 2h |
| QA | Dev1 | Bug-fix buffer from QA findings | 1.5h |

**Module 9 total: ~9.5h** (was 15h)

---

## Module 10 — Full Regression Testing, CI & Deployment
*Runs in parallel with Module 9 — Dev2's track doesn't block on Dev1's QA pass.*

| Track | Dev | Task | Est. hrs |
|---|---|---|---|
| Testing | Dev2 | Full end-to-end Supertest pass: every user journey (guest checkout, account checkout, admin flows) | 3.5h |
| CI/CD | Dev2 | Finalize CI: block merge on failing tests/lint; add staging deploy step | 2.5h |
| Perf | Dev2 | Basic load test against NFR target (50–100 concurrent users) | 2h |
| Docs | Dev2 | Developer handoff docs (setup, env vars, deploy steps) | 1.5h |

**Module 10 total: ~9.5h** (was 15h)

---

## Module 11 — Final Security Review & Sign-off
*Depends on Modules 8, 9, and 10 all landing.*

| Track | Dev | Task | Est. hrs |
|---|---|---|---|
| Security | Dev3 | Final security review: secrets rotation plan, backup verification, admin credential handoff | 3h |
| Security | Dev3 | Final penetration-test checklist sign-off before go-live | 3h |
| Docs | Dev3 | Security section of handoff docs (auth model, rate limits, what's logged and why) | 2h |

**Module 11 total: ~8h** (was 13h)

---

## Module 12 — Go/No-Go Review
| Task | Assignee | Est. hrs |
|---|---|---|
| Team review of everything above, launch decision | All | 2h |

---

## Parallel execution map

Because modules are scoped as vertical slices, several can run at once instead of strictly week-by-week:

- **Run together first:** Module 1 (Catalog) + Module 2 (Auth Pages/Admin Login) — no shared dependency.
- **Then together:** Module 3 (Product/Cart) + continue Module 2's tail — Module 3 only needs Module 1's product data.
- **Then together:** Module 4 (Session Security) + Module 5 (Checkout) — Module 4 needs Modules 2+3 done; Module 5 only needs Module 3.
- **Then:** Module 6 (Checkout Security) — needs 2, 4, 5.
- **Then:** Module 7 (Admin Panel) — needs 1, 2, 6.
- **Then together:** Module 8 (Vuln scan) + Module 9 (QA) + Module 10 (Regression/CI) — all three only need Module 7, not each other.
- **Finally:** Module 11 (Security sign-off) → Module 12 (Go/no-go).

## Revised totals by dev

| Dev | Original plan (Week 2–6) | Module plan (Claude Code-adjusted) |
|---|---|---|
| Dev1 — Mohammad SF | ~76h | ~48.5h |
| Dev2 — Mohammad Kh | ~75h | ~46.5h |
| Dev3 — Security dev | ~78h | ~47h |

At 15h/week/dev capacity, this compresses the original ~5 remaining weeks to roughly **3–3.5 weeks**, assuming the parallel groupings above are followed and no third-party blockers (Cloudinary/hosting accounts, brand assets) delay a module's start.