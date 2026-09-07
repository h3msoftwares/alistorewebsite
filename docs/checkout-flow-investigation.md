# Checkout Flow — Investigation Report

Date: 2026-09-06
Branch: `feature/checkout`

Investigation performed before writing any code, per request. Six areas
covered below, followed by the two open decisions and the resulting plan.

---

## 1. Checkout page — already fully implemented

- [`frontend/src/app/[locale]/checkout/checkout-view.tsx`](../frontend/src/app/%5Blocale%5D/checkout/checkout-view.tsx)
  is a complete page: react-hook-form + zod validation, a saved-address
  dropdown for logged-in users, a delivery-region select with a live
  delivery-fee quote, a guest email field (required only for guests), an
  order summary sidebar, a submit flow that lands on a confirmation screen
  showing the order number/total, plus empty-cart and loading states.
- [`frontend/src/app/[locale]/cart/cart-view.tsx`](../frontend/src/app/%5Blocale%5D/cart/cart-view.tsx)
  (line ~154) already links to it:
  `<Link href={\`/${locale}/checkout\`}>Proceed to checkout</Link>`.
- **Conclusion:** nothing to scaffold here — it's a working feature, not a
  placeholder.

## 2. Schema fields — all present, nothing to add

`Order` (`backend/prisma/schema.prisma`, lines 476–513) already has every
field a COD checkout needs:

| Field | Required? |
|---|---|
| `deliveryName`, `deliveryPhone`, `deliveryAddress`, `deliveryCity` | required |
| `deliveryRegion` | required (governorate; drives delivery-fee calc) |
| `deliveryArea`, `deliveryNotes`, `notes` | optional |
| `guestEmail` | optional (only used/required for guest checkout) |
| `addressID` | optional (link to a saved `Address`, snapshotted at order time) |
| `paymentMethod` | defaults to `COD`; `CARD` exists in the enum but is explicitly "reserved for future — rejected until a gateway is integrated" |

`Address` (`backend/prisma/schema.prisma`, lines 187–205) has `fullName`
(required, but defaults to the account name), `phone`, `addressLine`, `city`
(required), `area`, `region`, `notes` (optional), `isDefault`.

## 3. Order creation — real, working endpoint, both guest and logged-in

`POST /api/orders/checkout` (`backend/src/modules/orders/order.routes.ts`,
line 17) is mounted behind `optionalAuth`, so it serves both guests and
logged-in users. `backend/src/modules/orders/order.service.ts` (lines
83–191), inside one transaction:

- Rejects if there's no user session and no guest cart session.
- If `addressId` is passed, verifies it belongs to the authenticated caller
  (guests can never pass one) — prevents leaking another user's address.
- Loads the cart, 400s if empty, checks stock per line, computes subtotal +
  admin-configured delivery fee, creates the `Order` with a full item
  snapshot (name/SKU/price at time of purchase), decrements stock with a
  `StockMovement` ledger row, and clears the cart.
- Validation lives in `backend/src/modules/orders/order.schema.ts` (zod) and
  matches the frontend form 1:1.

**Conclusion:** this endpoint does not need to be built. It needs a
notification hook added after order creation.

## 4. Logged-in autofill — already built; UX question resolved below

Multiple-address support already exists in the account page
(`frontend/src/app/[locale]/account/account-view.tsx`, lines 300–378):
add/edit/delete addresses, one marked default, backend enforces "first
address is default, only one default at a time"
(`backend/src/modules/account/address.service.ts`, lines 22–38).

The checkout page's behavior **before this change**: if the user has ≥1
saved address, show a "Use a saved address" dropdown defaulting to "New
address" (i.e. not auto-selected); picking one calls `applySavedAddress` to
prefill the form fields (`checkout-view.tsx`, lines 164–177, 73–85).

**Decision (see below): auto-select the default address on page load.**

## 5. Email — nodemailer already installed and wired, just not for orders

- `nodemailer@^10` is a backend dependency; `backend/src/lib/mailer.ts` is
  the existing pattern: builds one pooled SMTP transporter from
  `SMTP_HOST/PORT/USER/PASSWORD`, `configured = false` when unset
  (dev/CI) → logs and no-ops instead of throwing. Two functions exist today:
  `sendPasswordResetEmail`, `sendVerificationEmail`, both **never throw** —
  failures are caught and logged, never surfaced to the caller.
- Call-site pattern to follow
  (`backend/src/modules/auth/email-verification.service.ts`, line 44):
  fire-and-forget —
  `void sendVerificationEmail(...).catch(err => console.error(...))` — so a
  slow/broken SMTP relay can't block or fail the HTTP response.
- `backend/.env.example` documents `SMTP_HOST/PORT/USER/PASSWORD/FROM` for
  Gmail app-passwords, plus `FRONTEND_URL` used to build links. Nothing
  order-specific is documented yet.
- **Gap:** `order.service.ts` calls no mailer function today. No order
  confirmation email is sent to the customer, and no notification reaches
  the store owner.

## 6. WhatsApp — confirmed nothing exists; proposed architecture

No WhatsApp code, package, or env var anywhere in the repo. Proposed
`NotificationService`, modeled directly on the existing mailer pattern
(never throws, logs when unconfigured, fire-and-forget from the caller):

```
backend/src/lib/notifications/
  notification.service.ts   // public interface, orchestrates email + whatsapp
  whatsapp.client.ts        // isolated Meta Cloud API call; stub/no-op for now
```

Interface:

```ts
sendOrderConfirmationEmail(order): Promise<boolean>       // customer, if we have an email
sendOrderConfirmationWhatsApp(order): Promise<boolean>    // customer, if we have a phone
sendOwnerNotification(order): Promise<{ email: boolean; whatsapp: boolean }>  // store owner, both channels
```

- `whatsapp.client.ts` exports one function, e.g.
  `sendWhatsAppMessage(to, template)`. The dev/no-credentials implementation
  logs `[whatsapp] would send to <to>: <message>` and resolves `true` — same
  "configured" boolean-gate pattern as `mailer.ts`
  (`WHATSAPP_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` unset ⇒ stub).
- `order.service.ts`'s `checkout()` gets one line after the transaction
  commits: `void notificationService.sendOrderConfirmation(order).catch(...)`
  — checkout logic itself never touches email/WhatsApp specifics.
- Swapping the stub for the real Meta Cloud API call later means touching
  only `whatsapp.client.ts` — nothing in checkout, `order.service.ts`, or the
  email side changes.

---

## Decisions made

1. **Logged-in autofill:** auto-select the default saved address on page
   load (prefill the form immediately; still editable, still switchable via
   the dropdown), rather than leaving the form blank until the user picks
   one.
2. **Notification scope for this pass:** wire real SMTP emails to the
   customer (order confirmation) and to the store owner (new-order alert)
   using the existing `mailer.ts` pattern. WhatsApp gets the interface +
   logging stub only — no real Meta Cloud API call yet.

## Resulting plan

**1. Autofill (frontend only, small change)**
In `checkout-view.tsx`, once `addresses.data` loads for an authenticated
user, auto-apply the default address (`isDefault: true`, or first in the
list — the API already sorts default-first) via the existing
`applySavedAddress` function, and pre-select it in the dropdown. Everything
else about the dropdown (switch to another saved address, or "New address"
to clear) stays as-is.

**2. NotificationService (backend, new)**

```
backend/src/lib/notifications/
  notification.service.ts   // sendOrderConfirmationEmail, sendOwnerNotification (email+whatsapp), sendOrderConfirmationWhatsApp
  whatsapp.client.ts        // sendWhatsAppMessage() — WHATSAPP_TOKEN/PHONE_NUMBER_ID-gated stub, logs and returns true when unconfigured
```

- `sendOrderConfirmationEmail` extends `lib/mailer.ts` with a new
  `sendOrderConfirmationEmail(to, order)` following the exact same
  transporter/never-throw pattern as `sendPasswordResetEmail`.
- `sendOwnerNotification(order)` emails a new `OWNER_NOTIFICATION_EMAIL` env
  var (to be documented in `.env.example`) and calls the WhatsApp stub for
  the same content.
- WhatsApp send is fully stubbed (logs `[whatsapp] would send...`) — no real
  Meta Cloud API call yet.
- `order.service.ts checkout()` gets one fire-and-forget call after the
  transaction commits:
  `void notificationService.sendOrderConfirmation(order).catch(...)`.
  Checkout's response time and behavior are unaffected if email/WhatsApp
  fail.

**3. No changes needed to:** the Order/Address schema, the checkout
endpoint's validation, or the address CRUD — all already correct as
investigated.
