# Cash payouts, goodwill and refunds due

This extends refund marking on main without changing refund calculations,
pricing, fulfillment, restocking, collection evidence rules, or category caps.

## Schema and transactions

Forward migration `20260928010000_cash_refund_payouts` adds `goodwillrefund`
and `refundpayout`. Goodwill has a positive Decimal(12,2) amount, required
internal reason, OWED/PAID/CANCELLED status, creator and cancellation metadata.
One payout links to exactly one return or goodwill refund, with unique source
IDs, positive amount, order currency, fixed CASH enum, required payer, date,
nullable trimmed reference/note, and immutable recorder identity/name snapshot.
Database triggers reject payout UPDATE/DELETE, validate source order/amount/
currency, and require evidence on positive return transitions and paid goodwill.
Existing REFUNDED rows remain unchanged, without backfill. Their missing
evidence is displayed as “No payout record”. A new zero refund creates no payout.

Dates are calendar dates in Asia/Beirut, default today, and cannot be future.
No method selector exists. CASH is an enum so a later supported method could
be added without replacing the table; this release supports only cash.

Return status, effective allocations, cash evidence and audit entries commit
together under the order FOR UPDATE lock. Goodwill creation/payment/cancellation
and collection reversal use the same lock. Paid now creates, reserves and pays
atomically. A payment preserves its existing reservation; cancellation releases
an OWED reservation. PAID goodwill cannot be cancelled. Mutation endpoints
require refunds:manage and fresh authentication; read-only order detail uses
orders:view. Existing permissions and staff role grants are unchanged.

## Cap assumption

Let C be net collected, F delivery fee, M refunded merchandise, D refunded
delivery, and G all OWED or PAID goodwill. Category limits remain:

- Merchandise: max(0, C - F - M).
- Delivery: max(0, min(F, C) - D).
- Combined: max(0, C - M - D - G).

Goodwill reserves capacity only in the combined limit. It does not rewrite
the merchandise limit or allocate itself to delivery. A return refund must
pass both existing category limits and the reduced combined limit. Creating
goodwill checks collection evidence and combined remaining; reversal must
leave C >= M + D + G. This permits goodwill up to net collected even when the
merchandise limit is smaller, while keeping later return marking constrained.

## Refund due and reporting

Refund due counts RECEIVED return requests plus OWED goodwill records,
not distinct orders. The amount is saved merchandise refund calculations on
those returns plus owed goodwill. Delivery has no selected amount until
marking, so it is not assumed in the reminder. Adjusting the paid return
amount later can make it differ from the earlier reminder.

REFUND_DUE is the admin order filter; the older AWAITING_REFUND_MARKING API
filter remains supported with its original received-return-only meaning.
Indicators, the detail page, the dashboard work tile and analytics summaries
include goodwill. Customer received-return wording remains unchanged.

The existing order-revenue basis excludes delivery, which is reported
separately. Net order revenue is net merchandise minus PAID goodwill. OWED
and CANCELLED goodwill do not reduce revenue. Merchandise values and product,
category, size and colour allocations do not contain goodwill. Delivery
revenue remains charged delivery minus refunded delivery. Analytics overview,
series, customer order spending and dashboard revenue use the order deduction.
Paid goodwill is also shown as a separate figure.

Customer/guest order APIs expose only paid goodwill's ID, amount and status.
They strip reasons, payout records, actor metadata and owed-goodwill counters.
Their shared order card shows the neutral “Refund from the store” plus amount.

## Audit and correction today

`refund.payout_recorded`, `goodwill.created`, `goodwill.paid`, and
`goodwill.cancelled` are written in their transaction with order/amount/actor,
payer (null when unpaid), reasons where applicable, and all remaining-cap
figures before/after. Existing return adjustment/status audit events remain.

An incorrect OWED goodwill refund can be cancelled with a required reason
and recreated. A completed return refund is terminal, PAID goodwill cannot
be cancelled, and cash evidence cannot be edited/deleted. There is currently
no supported application correction for a wrongly completed refund or payout.
It needs an operator investigation and a separately designed, reviewed,
forward-only corrective change preserving the original evidence and audit.
Do not use a collection reversal to erase a refund; its combined guard remains.
No correction flow was built in this task.

## Verification

Integration tests exercise cash validation, exact payout totals, zero refunds,
legacy evidence, paid now rollback, reservation/release, partial collection,
combined limits, concurrent goodwill/return marking, reversal guards,
permissions/fresh auth/revocations, audit, analytics and customer/guest privacy.
Frontend tests cover payout fields, goodwill dialogs/section, hidden controls,
reminders, filter, dashboard and English/Arabic/customer wording.

Verified 1,014 backend tests across the full run and final targeted reruns.
The full run's 40 hCaptcha failures were caused by sandbox network restrictions
and passed outside the sandbox; the updated dashboard-response assertion also
passed. All 645 frontend tests are verified across the full run and corrected
targeted reruns. Both TypeScript checks and lint for changed source files pass.
The forward migration was applied to local development and test databases.

Prisma generation wrote the new client/types but could not replace the engine
DLL (EPERM, including outside the sandbox). The existing DLL matches the
installed Prisma package exactly; runtime integration tests use it successfully.
No running user service was stopped to replace it.

Real browser verification was unavailable: the connected browser inventory
was empty. Automated DOM tests do not verify actual RTL layout, responsive
presentation, browser date-picker behavior or the visual fresh-auth flow.
