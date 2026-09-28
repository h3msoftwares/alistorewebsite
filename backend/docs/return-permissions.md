# Return and refund permission rollout

## Behavior

The backend catalog and frontend mirror now contain `returns:view`,
`returns:manage`, `refunds:view`, and `refunds:manage`. Manage implies view on
the server before user revocations are applied. Existing permission keys keep
their meaning. ADMIN automatically receives the expanded catalog minus their
revocations. No existing staff role or user is granted a new key automatically.
No schema change, migration, or permission backfill is required.

Physical handling requires `returns:manage` plus fresh authentication. Refund
marking, including merchandise adjustments and delivery refunds, requires only
`refunds:manage` plus fresh authentication. Recording and correcting COD
collection continues to require `payments:manage` plus fresh authentication.
The monetary services, collection evidence, refund caps, pricing, inventory
operations, and fulfillment transition rules are unchanged.

`returns:view` has a meaningful read-only use: the Returns list page and API.
Embedded return details, order-list indicators and return-work counts retain
`orders:view`; the dashboard retains its existing dashboard gate.
`refunds:view` currently has no separate read-only surface. It is catalogued as
requested; the roles permission grid shows “Reserved” instead of a selectable
view checkbox, in English and Arabic. Existing stored keys are preserved on
role edits. Existing order and Returns reads
continue to expose their refund information under their existing read gates.

The shared `useReturnPermissions` hook controls physical actions, creation,
whole-order RETURNED options, and refund marking. Unauthorized controls are
absent. Sidebar and mobile navigation share the `returns:view` route mapping.
The frontend consumes the server's effective permissions without re-expanding
them, so a revoked view key cannot be restored by a remaining manage key.
New permission labels are available in English and Arabic.

## Every mutation path

All paths below are relative to `/api`. Admin paths first require an
authenticated STAFF or ADMIN. Permissions are resolved from the current user
and stored role at request time, including `revokedPermissions`.

| Route | Service chain that creates or changes a Return | Coverage |
| --- | --- | --- |
| `POST /admin/orders/:id/returns` | `adminRequestReturn` → `performReturnRequest` → `createReturnRecords` | `returns:manage`, fresh auth |
| `PATCH /admin/returns/:id/status` to APPROVED, REJECTED, IN_TRANSIT, RECEIVED or CANCELLED | `updateReturnStatus` | `returns:manage`, fresh auth; all legal physical transitions, including admin cancellation |
| `PATCH /admin/returns/:id/status` to REFUNDED | `updateReturnStatus` | `refunds:manage`, fresh auth; no orders or payments manage requirement |
| `PATCH /admin/orders/:id/status` to RETURNED (legacy whole-order action) | `updateOrderStatus` → `createWholeOrderReturn` → `createReturnRecords` | `orders:manage` AND `returns:manage`, fresh auth |
| `PATCH /admin/orders/:id/correction` to RETURNED | `correctOrderStatus` → `createWholeOrderReturn` → `createReturnRecords` | `orders:manage` AND `order_corrections:manage` AND `returns:manage`, fresh auth |
| `POST /orders/:id/returns` | `requestReturn` → `performReturnRequest` → `createReturnRecords` | Authenticated owning customer; unchanged |
| `POST /orders/:id/returns/:returnId/cancel` | `cancelReturn` → `performCancelReturn` | Authenticated owner and matching return; unchanged |
| `POST /orders/track/:token/returns` | `requestReturnByToken` → `performReturnRequest` → `createReturnRecords` | Valid unexpired order token; unchanged |
| `POST /orders/track/:token/returns/:returnId/cancel` | `cancelReturnByToken` → `performCancelReturn` | Valid unexpired order token and matching return; unchanged |

`performReturnRequest` and `performCancelReturn` are private shared helpers;
`createReturnRecords` and `createWholeOrderReturn` are transaction helpers with
only the callers listed above. The status-writing services are covered at
their HTTP entry points; the call-site audit found no other production creator
or status mutation. Reaching RECEIVED still restocks through the same service.
Rejected/cancelled requests still release their quantity claim as before.

Read-only previews do not mutate a Return. Admin preview
`POST /admin/orders/:id/returns/preview` now requires `returns:manage` and keeps
its existing lack of a fresh-auth requirement. Customer and guest preview
routes retain ownership and token checks. `GET /admin/returns` requires
`returns:view`. COD collection routes and read gates are unchanged.

## Existing staff roles and manual grants

The local development database was inspected read-only. It contains these
three stored role definitions, each lacking the new keys:

| Stored role | Abilities lost after rollout | Exact new grants in the admin Roles page |
| --- | --- | --- |
| Order desk (`dashboard:view`, `orders:view`, `orders:manage`) | Returns list/navigation; create/preview on behalf of customer; approve/reject/transit/receive/cancel; whole-order return | Grant `returns:manage` (implies `returns:view`) to restore handling and list access. Its existing `orders:manage` retains the additional whole-order requirement. |
| Full access (stored explicit permission list) | Same return handling and list access as Order desk | Grant `returns:manage`. Grant `refunds:manage` separately if refund marking is intended. |
| Catalog editor | None: it had no orders/return/refund access | No grants required. |

The locally stored Full access role predates the COD permission addition and
does not currently include `payments:manage`; neither it nor default Order
desk could mark refunds under the previous orders+payments bundle. Any custom
or modified staff role that previously held both `orders:manage` and
`payments:manage` loses refund marking until explicitly granted
`refunds:manage`. Granting `payments:manage` never restores refund marking.

For a dedicated refund marker using the Returns page, grant `refunds:manage`
AND `returns:view`. To mark from order detail, grant `refunds:manage` AND
`orders:view`. For a read-only returns reviewer, grant just `returns:view`.
For a return handler who creates returns from order detail, retain/grant
`orders:view` alongside `returns:manage`. A role with both new manage keys may
handle returns and mark refunds without having collection management.
Fresh authentication and per-user revocations still apply to every grant.

`prisma/seed.ts` defines an explicit Full access list. The list includes the
four new keys when creating a new role. Its upsert now preserves the stored
permission list when that role already exists, so rerunning the seed neither
adds these keys to existing staff nor removes manual grants. Order desk and
Catalog editor lists remain unchanged. `seed-empty.ts` and `seed-large.ts`
create an ADMIN account but define no staff-role permission lists; ADMIN gets
the new permissions through the catalog. QA fixtures reuse existing roles.

## Verification

Integration tests exercise every legal physical/refund transition with the
right permission and without it, fresh-auth rejection, staff/ADMIN revocations,
separate collection access, both legacy whole-order routes, read boundaries,
customer/guest requests, previews and cancellation. Existing monetary tests
continue to exercise collection evidence, adjustments, both category caps,
combined caps, reversal, concurrency, and atomic audit rollback.

Frontend tests exercise catalog parity, route mapping, hidden physical and
refund controls, hidden create/whole-order options (including corrections),
both sidebar and mobile navigation, and revoked-view handling.
Real-browser verification was unavailable because this session exposes no
browser to the computer-use tool; DOM/component tests cover the UI gates.

Validation results: all 629 frontend tests passed; the final Returns-page
confirmation-guard recheck passed all 15 tests. Both typechecks, backend lint,
and lint for the changed frontend files passed. The focused backend run passed
all 71 tests. The full backend run passed 951 of 992 tests; its hCaptcha network
failures were rechecked outside the sandbox, passing 91 of 92 tests in those
seven files. Across the full run and recheck, 991 distinct backend tests passed.
The remaining failure at that stage was the stale coupon test at
`tests/integration/promotions.test.ts:419`: it expected a $45 `unitPrice`, while
checkout stores $40 after the $10 coupon is allocated over two units.
The same targeted test was then reproduced from an isolated archive of commit
`49df003`, without the permission split. Its $45 assertion dates to `5a0d31d`
(September 12); `30ce9f4` (September 26) deliberately changed item snapshots
to post-coupon prices. The isolated test resets `alistore_test` before running;
its saved order has a $90 pre-coupon line, $10 coupon, $80 net line, and exact
unit cents `[4000, 4000]`, with no combo or Loyalty rules. With approval, the
test now expects $40 and asserts the $80 line total and exact coupon allocation.
All 18 promotion integration tests pass after that update. Pricing code remains
unchanged.
