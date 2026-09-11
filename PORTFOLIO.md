---
title: "Ali's Store"
subtitle: "Bilingual (EN/AR) e-commerce platform with a permission-scoped admin panel"
date: 2026-09
role: "Full-stack — architecture, API, frontend, design system, tests"
stack: [Next.js, React, Express, Prisma, PostgreSQL, "React Query", "Redux Toolkit"]
repo: ""
demo: ""
featured: true
---

# Ali's Store

A production storefront and back office for a Lebanese clothing retailer — built
**English/Arabic first** with full RTL, **cash-on-delivery** checkout, and an admin
panel gated by a granular role system.

## Overview

Ali's Store is designed around how a small shop actually sells: no card gateway, a
bilingual customer base, and one or two people running everything. Every page is
EN/AR with the whole layout mirroring for Arabic, and the storefront — hero,
featured rows, banners, story page, reviews — is composed and reordered from the
admin with no deploy.

## Highlights

- **Bilingual + RTL throughout** — a single `t(en, ar)` helper and a design system
  built on CSS logical properties, so Arabic mirrors with no duplicate styles.
- **RBAC admin panel** — `view` / `manage` permission per area (orders, products,
  customers, discounts, roles…), custom roles, per-user revokes, and a delegation
  ceiling so staff can't escalate their own access. Admin login sits on an
  unguessable path.
- **Security-first auth** — JWT access tokens + rotating refresh tokens with reuse
  detection, step-up re-auth for sensitive actions, Argon2, account lockout, email
  verification, and uniform rejections to resist account enumeration.
- **Checkout built for COD** — email-OTP verification, coupons and catalog
  discounts resolved live, per-governorate delivery fees, guest order tracking by
  signed token, and an advisory lock that serialises a shopper's concurrent
  checkouts.
- **Owner-controlled home page** — featured collections, full-width image banners,
  and "best sellers / new / on sale" smart rows, each slotted into a single
  ordering system by the admin.
- **Lenient catalogue search** — punctuation- and plural-insensitive with a small
  apparel synonym map ("tee" → t-shirt), backed by a Postgres `pg_trgm` index.
- **Anti-abuse** — admin blacklist, automatic order-velocity flagging, and
  customer account blocking with a clear reason shown at sign-in.
- **Analytics** — first-party sales / inventory / customer aggregation plus GA4
  traffic and funnel.

## Tech

**Frontend** Next.js (App Router) · React · React Query (server prefetch +
hydration) · Redux Toolkit · hand-built vanilla-CSS design system · ImageKit

**Backend** Node · Express · Prisma · PostgreSQL · Zod · strict CSP

**Quality** Vitest integration tests against a real Postgres · Testing-Library
component tests · CI pipeline · k6 load test · Playwright E2E sweep

## Engineering notes

- The design system is vanilla CSS on purpose — a small token set and component
  classes, no UI framework, single (light) theme, fully RTL.
- The data layer prefetches on the server and hydrates React Query on the client,
  so the first paint is real content and in-app navigation is instant.
- Integration tests run against a live database (truncated between tests), not
  mocks, so schema and query behaviour are genuinely covered.
