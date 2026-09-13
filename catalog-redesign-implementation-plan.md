# Catalog redesign — implementation plan

Target design: `robust-ecommerce-catalog-architecture.md` (as provided). This
file is the bridge between that spec and this specific codebase — what to
build first, what to watch for, and how to hand this to a fresh Claude Code
session cleanly.

## The one simplification that changes everything here

**All 120 products are fake data, under active development, no real orders
riding on the current schema.** This means the usual careful migration dance
— add new tables alongside old ones, backfill row by row, migrate every read
path, only then drop old columns — is unnecessary caution for data that
doesn't need preserving. Just:

1. Write the new schema directly (drop `Product.collectionID`, add
   `Category.parentID`/`path`/`depth`, add `primaryCategoryID`, add
   `ProductCategory`, `Collection`, `CollectionProduct`, etc.)
2. Run a real Prisma migration (`prisma migrate dev` — it will likely want to
   reset given how structural this is)
3. Rewrite `seed.ts` for the new shape and reseed from scratch

No backfill logic needed. This turns weeks of careful migration engineering
into a much smaller, much safer task specifically because there's nothing
real to lose right now. Confirm this framing with whichever Claude Code
session does the implementation before it defaults to a more cautious
backfill-style migration it doesn't need to build.

## One hardening addition to the proposed schema

`Category.path`/`depth` are denormalized fields the spec correctly says must
be "maintained in a transaction or DB trigger." Be specific about which: a
real Postgres trigger (`AFTER INSERT OR UPDATE ON category`, recomputing
`path`/`depth` for the row and cascading to descendants) is the safe choice.
An app-code-only version ("the service function remembers to update it")
is the exact same failure shape as `Product.quantity` — a second source of
truth that's correct today and silently wrong the first time someone edits
a category through a path that forgot to update it. Don't repeat that bug
one layer up.

## Stage 1 — the load-bearing core (build and verify first)

- `Category`: self-referencing tree, `path`/`depth` trigger-maintained,
  the five integrity rules listed in the spec (no self-parent, no cycles,
  no duplicate sibling slugs, no new products onto archived categories,
  archive/restore semantics matching what this session already established
  — compute visibility at read time, never propagate a flag onto children)
- `Product.primaryCategoryID` + `ProductCategory` for additional memberships
- Simple `Collection` + `CollectionProduct`, **manual membership only** —
  no `CollectionRule`, no `Promotion` yet
- Migrate every existing read/write path off the old
  `Collection → Category → Product` shape onto the new one
- Re-run the full existing test suite, plus new tests for: category nesting
  at real depth, a product with a primary + one additional category,
  archive/restore at each level (reusing the exact test shape from #8/#22
  earlier this session — same principle, new tables)

**Don't move to Stage 2 until Stage 1 is genuinely solid** — used, tested,
and any surprises from actually living with the new shape (an edge case in
primary-category assignment, an archiving interaction not anticipated)
resolved. Building the rule engine on top of an unproven foundation just
means debugging through two new layers at once instead of one.

## Stage 2 — rules and promotions (build once Stage 1 is proven)

- `CollectionRule` with the structured field/operator/value model exactly as
  specified — validated, never raw SQL/JS, matching this session's existing
  security bar (7.1's injection findings all passed; keep it that way)
- `Promotion` + `PromotionProduct`/`PromotionCategory`/`PromotionCollection`
- **The `priority`/`stackable` fields here directly resolve a decision this
  session left as deliberately unfixed** (the discount-specificity behavior
  — "most specific always wins, even at a worse price," accepted as-is at
  the time). Building `Promotion` properly reopens that decision on purpose,
  not by accident — decide it explicitly this time rather than inheriting
  the old implicit default.
- Automated `Sale` collection: `HAS_ACTIVE_PROMOTION EXISTS` rule, replacing
  any manual sale-page maintenance

## What NOT to touch

The 22 fixes from the batch-by-batch QA pass (checkout price validation,
order-placement throttle, cancel/ship race, returns restocking, connection
pool, rate limiter, admin/customer session split, PDP variant selector,
generic image logic, cart concurrency, sort tiebreaker, deep-linked variants,
all of Section 7's security items) are unrelated to this redesign and should
not be touched except where a Stage 1 change genuinely requires it (e.g. any
code reading the old `Product.collectionID` or `Category.collectionID` will
need updating as a direct consequence of the schema change — that's expected,
not scope creep). If implementing Stage 1 surfaces a reason to touch anything
outside the catalog/category/collection area, flag it before proceeding,
same stop-and-flag discipline as the batch-fix session.
