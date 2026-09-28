# Effective refund marking

Calculated refund pricing is unchanged. `Return.refundAmount` and
`ReturnItem.refundAmount` retain their original values and continue to drive
purchase-time pricing history. Quantities, inventory, fulfillment transitions,
and collection-evidence requirements retain their existing behavior.

## Schema and migration

Forward-only migration: `20260928000000_effective_return_refunds`.

| Table | Added columns | Meaning |
| --- | --- | --- |
| `return` | `refundedAmount` nullable Decimal(12,2) | Effective merchandise amount saved at marking |
| `return` | `refundAdjustmentReason` nullable text | Internal merchandise adjustment reason |
| `return` | `refundAdjustedBy` nullable UUID, `refundAdjustedAt` nullable timestamp | Actor and time when merchandise differs from calculation |
| `return` | `deliveryRefundAmount` Decimal(12,2), default 0 | Explicit delivery amount marked refunded |
| `return` | `deliveryRefundReason` nullable text | Internal delivery reason |
| `returnitem` | `refundedAmount` nullable Decimal(12,2) | Saved effective merchandise allocation |

Database checks reject negative effective merchandise and delivery amounts.
There is no effective-amount backfill and no catalog/inventory migration.
Legacy REFUNDED lines use `COALESCE(refundedAmount, refundAmount)` in all
marking totals, analytics, and indicators. Zero is a stored amount, not a
missing value. Actor UUIDs on the Return are retained snapshots rather than
foreign keys that disappear on account deletion.

## Caps and invariant

All variables below are integer cents. Let C be net collected, F the delivery
fee, M merchandise already marked refunded (effective allocations with legacy
fallback), and D delivery already marked refunded.

- Merchandise available: `max(0, C - F - M)` (existing collection-evidence cap).
- Delivery available: `max(0, min(F, C) - D)` (delivery is collected first).
- Total available: `max(0, C - M - D)`.

Each new merchandise and delivery amount must pass its own category cap AND
their sum must pass the total cap. **Total marked refunded never exceeds net
collected**, checked on both refund marking and collection reversal under the
same order row lock. No extra delivery reservation is imposed on reversal:
it keeps its existing total-marked-money rule, now including delivery.

The category caps are independent limits. The additional combined-total check
ensures their combined markings never exceed what was collected, including
after a reversal. For example, $110 collected, $100 merchandise marked, then
a $10 reversal leaves $100 collected. The delivery category still has $10
available, but the total cap is $0, so delivery marking is blocked.

Zero merchandise can be marked without collection evidence, as before; a
reason is required if zero differs from the calculated amount. Higher amounts
are allowed within the collection cap without a new per-line pricing cap.
Delivery is off by default and a positive delivery amount requires its own
reason. A marking is an administrative record; it does not move money or
prove payment.

## Allocation, audit, and access

Effective merchandise is allocated proportionally to the saved calculated
line amounts using exact BigInt largest-remainder arithmetic. Equal
remainders use ascending immutable ReturnItem IDs. If all calculated amounts
are zero, line quantities are the weights. The saved line allocation always
sums to the exact chosen cent and does not change quantities.

Marking, cap checks, line allocations, and audit inserts commit in one
transaction under the order lock. `return.status_changed` includes calculated
and effective cents, difference, internal reason, delivery amount and reason,
and merchandise/delivery/total availability before and after. A merchandise
adjustment also writes `return.refund_adjusted` atomically. Failure of either
audit insert rolls back the marking and allocations.

REFUNDED requires `orders:manage`, `payments:manage`, and fresh authentication.
Other return transitions retain their existing permission checks. Both admin
pages hide marking controls unless both manage permissions are held.

Customer and guest APIs remove the internal reasons and adjustment actor/time.
Their UI shows final amounts and “Adjusted by the store” when applicable.
The quantity-discount explanation is suppressed on adjusted returns; it never
describes the effective amount as if it were calculated. Subsequent pricing
explanations label prior amounts as calculated, since the pricing history
continues to use those unchanged amounts.

## Reporting and validation

Merchandise marked refunded and net merchandise use effective line amounts.
Delivery revenue is delivery fees charged minus delivery marked refunded,
aggregated once per return regardless of its number of lines. Labels retain
“Marked refunded”. Settlement, credit, exchanges, and a permission split are
outside this change.

Tests cover lower/higher/zero choices, required reasons, invalid amounts,
cumulative caps, delivery-first partial collection, the exact reversal
example, full collection allowing both amounts, concurrent markings against
category and combined caps, reversal including delivery, exact allocations,
legacy analytics, effective analytics, atomic audits, unchanged pricing
history, permission hiding, and customer/guest reason privacy.

The migration was applied only to the dedicated `alistore_test` database during
verification. Deployment requires the forward migration before the backend
and frontend release. No real-browser verification was possible: computer-use
reported both Chrome and the in-app browser unavailable. UI interactions,
English/Arabic copy, visibility, and dialog validation were checked with
React Testing Library; API/transaction behavior was checked against PostgreSQL.

Validation: 130 backend refund/order regression tests and 61 focused frontend
tests passed. Both projects type-check; the Prisma schema validates. Backend
lint and focused lint of changed frontend files pass. Repository-wide frontend
lint has six existing errors in unchanged files (promotion form, email template
panel, mobile navigation, print preferences, sidebar state, and typewriter hook).
Local Prisma generation updated the client types but could not replace the
engine DLL held by the already-running backend process; PostgreSQL tests used
that same engine successfully. Normal generation should run after releasing
the DLL during the deployment/restart workflow.
