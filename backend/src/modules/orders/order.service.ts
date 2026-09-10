import { createHash, randomBytes } from 'crypto';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { generateUniqueOrderNumber } from '../../lib/orderNumber';
import { recordAudit } from '../../lib/audit';
import {
  sendOrderPlacedNotifications,
  sendOrderCancelledNotifications,
  sendOrderShippedNotifications,
} from '../../lib/notifications/notification.service';
import { isBlacklisted } from '../blacklist/blacklist.service';
import { activeDiscounts } from '../discounts/discount.service';
import { resolveCoupon, couponAmountOff } from '../discounts/coupon.service';
import { lineUnitPrice } from '../../lib/line-pricing';
import { round2 } from '../../lib/money';
import {
  resolveDeliveryFee,
  toDeliveryConfig,
  type DeliveryConfig,
} from '../../lib/delivery-fee';
import { REGION_VALUES } from '../../lib/regions';
import { Order, OrderItem, OrderStatus, Prisma } from '@prisma/client';

type OrderWithItems = Order & { items: OrderItem[] };

/** The set of delivery regions a checkout may name: the built-in governorates
 *  plus any custom zone the admin has given a rate or a free-delivery flag. */
function knownRegions(cfg: DeliveryConfig): Set<string> {
  return new Set<string>([
    ...REGION_VALUES,
    ...cfg.deliveryRates.map((r) => r.region),
    ...cfg.freeDeliveryRegions,
  ]);
}

interface CheckoutOwner {
  userID?: string;
  sessionID?: string;
}

interface CheckoutInput {
  addressId?: string;
  saveAddress?: boolean;
  guestEmail?: string;
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryRegion: string;
  deliveryArea?: string;
  deliveryNotes?: string;
  notes?: string;
  /** The "verified" ticket from POST /api/checkout/otp/verify. Required
   *  unless the caller is logged in with a verified account email. */
  emailVerifyToken?: string;
  /** Optional coupon code; must resolve to an active, in-window coupon. */
  couponCode?: string;
  /** req.ip at checkout time — used for the blacklist check and the
   *  order-velocity flag below. Undefined only in tests that call the
   *  service directly without going through the HTTP layer. */
  ipAddress?: string;
}

// Same construction as checkout-otp.service.ts / auth.service.ts — only the
// hash is ever stored, never the raw ticket.
function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Order-velocity soft-flag thresholds — crossing any of these flags the
// order for admin review but never blocks it (unlike a BlacklistEntry hit,
// which hard-blocks). Counts every order in the window regardless of status:
// a pattern of orders that got cancelled after admin caught them is still
// exactly the evidence this exists to surface.
const VELOCITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const VELOCITY_PHONE_MAX = 3;
const VELOCITY_EMAIL_MAX = 3;
const VELOCITY_IP_MAX = 5;

// Checkout is the heaviest transaction in the app (address check, cart load,
// discount resolution, order + N line items, velocity counts, per-line stock
// claim, coupon redemption). Under a burst of shoppers hitting the same
// popular variant the atomic stock/coupon row-claims serialize, so the last
// checkout in line can wait well past Prisma's default 5s ceiling — which would
// surface as a 500 rather than an orderly "sold out". These give that queue
// real headroom without letting a genuinely stuck transaction hang forever.
const CHECKOUT_TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

// A customer (or a guest bearing a valid access token) may cancel their own
// order up to — but not including — SHIPPED. An admin isn't bound by this;
// see performCancellation's `enforceCancellableGate`.
const CANCELLABLE_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED'];

// How long an OrderAccessToken stays valid, however it was issued (minted at
// checkout for the confirmation email, or freshly minted by /orders/lookup).
// Generous enough that "let me check on last month's order" always works;
// bounded so a leaked link (browser history, forwarded email) doesn't stay
// exploitable forever. Expired ⇒ the guest just uses /orders/lookup again.
const ORDER_ACCESS_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Mints a fresh guest access token for `orderId` and returns the raw value
 *  — only its hash is ever stored. Called both inside checkout()'s
 *  transaction (the token in the confirmation email) and standalone from
 *  lookupOrder() (a freshly re-issued one) — each call always creates a new
 *  row, never touching any token already issued for the same order. */
async function mintAccessToken(db: DbClient, orderId: string): Promise<string> {
  const raw = randomBytes(32).toString('base64url');
  await db.orderAccessToken.create({
    data: {
      orderID: orderId,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + ORDER_ACCESS_TOKEN_TTL_MS),
    },
  });
  return raw;
}

/** Looks up a live (unexpired) OrderAccessToken by its raw value. Used by
 *  both the tracking view and token-based cancellation — a token is never
 *  single-use, so no "consumed" bookkeeping here (unlike CheckoutOtp). */
async function findValidAccessToken(rawToken: string) {
  return prisma.orderAccessToken.findFirst({
    where: { tokenHash: hashToken(rawToken), expiresAt: { gt: new Date() } },
    include: { order: { include: { items: true } } },
  });
}

function trackingUrl(rawToken: string): string {
  return `${env.FRONTEND_URL.replace(/\/+$/, '')}/en/orders/track/${rawToken}`;
}

// A logged-in customer already has a real session and /orders/[id] — no
// bearer-token credential needed, so their confirmation email links there
// directly instead. /orders/[id] prompts an unauthenticated visitor to sign
// in first (?next= brings them straight back), covering the case where the
// email is opened on a different device/browser.
function accountOrderUrl(orderId: string): string {
  return `${env.FRONTEND_URL.replace(/\/+$/, '')}/en/orders/${orderId}`;
}

const DISABLED_CONFIG: DeliveryConfig = {
  deliveryFeeEnabled: false,
  deliveryFeeFlat: 0,
  freeDeliveryThreshold: null,
  freeDeliveryRegions: [],
  deliveryRates: [],
};

async function loadDeliveryConfig(db: DbClient): Promise<DeliveryConfig> {
  const setting = await db.siteSetting.findUnique({
    where: { id: 1 },
    include: { deliveryRates: true },
  });
  return setting ? toDeliveryConfig(setting) : DISABLED_CONFIG;
}

async function loadCartSubtotal(db: DbClient, owner: CheckoutOwner): Promise<number> {
  const cart = await db.cart.findUnique({
    where: owner.userID ? { userID: owner.userID } : { sessionID: owner.sessionID! },
  });
  if (!cart) return 0;
  const [items, discounts] = await Promise.all([
    db.cartItem.findMany({
      where: { cartID: cart.id },
      include: {
        variant: {
          select: {
            price: true,
            product: {
              select: {
                price: true,
                saleType: true,
                saleValue: true,
                categoryID: true,
                collectionID: true,
              },
            },
          },
        },
      },
    }),
    activeDiscounts(),
  ]);
  return round2(items.reduce((sum, i) => sum + lineUnitPrice(i.variant, discounts) * i.quantity, 0));
}

/** Live delivery-fee estimate for the caller's current cart + a chosen
 *  governorate. Powers the checkout form's order summary. */
export async function getDeliveryQuote(owner: CheckoutOwner, region: string) {
  if (!owner.userID && !owner.sessionID) {
    return { subtotal: 0, deliveryFee: 0, total: 0, freeReason: 'disabled' as const };
  }
  const [subtotal, cfg] = await Promise.all([
    loadCartSubtotal(prisma, owner),
    loadDeliveryConfig(prisma),
  ]);
  const { fee, freeReason } = resolveDeliveryFee(cfg, subtotal, region);
  return {
    subtotal,
    deliveryFee: fee,
    total: Math.round((subtotal + fee) * 100) / 100,
    freeReason,
  };
}

/** Creates a COD order from whatever is currently in the cart, snapshotting
 *  product/variant detail onto each OrderItem, decrementing stock (with a
 *  StockMovement ledger row per line), and clearing the cart — all in one
 *  transaction so a half-finished checkout can't leave stock or the cart in a
 *  bad state. */
export async function checkout(owner: CheckoutOwner, input: CheckoutInput) {
  if (!owner.userID && !owner.sessionID) {
    throw new AppError('VALIDATION_ERROR', 'No cart owner (user or guest session) provided');
  }

  let rawAccessToken: string | undefined;
  const order = await prisma.$transaction(async (tx) => {
    // Serialize a single shopper's own concurrent checkouts. Without this, N
    // parallel POST /api/orders/checkout for the same cart each read the cart
    // before any of them clears it (READ COMMITTED) — producing N duplicate
    // orders from one cart — and each passes the per-customer coupon check
    // while the redemption count is still 0, so `maxPerCustomer` is bypassed.
    // A transaction-scoped advisory lock keyed on the cart OWNER (not on the
    // coupon row or any shared row) serializes exactly that one shopper's
    // requests and nobody else's, and releases automatically on commit or
    // rollback. The requests that lose the race re-read an already-emptied
    // cart and get a clean "cart is empty" 400.
    const ownerLockKey = owner.userID ? `checkout:u:${owner.userID}` : `checkout:s:${owner.sessionID}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ownerLockKey}), 0)`;

    // A saved-address reference must belong to the person checking out. Without
    // this, an authenticated user could pass another user's Address id — it
    // would be stored as the order's `addressID` and handed straight back by
    // GET /api/orders/:id (which `include`s the address), leaking that user's
    // name / phone / street. Guests have no saved addresses, so any id from a
    // guest is rejected outright.
    if (input.addressId) {
      const owned = owner.userID
        ? await tx.address.findFirst({
            where: { id: input.addressId, userID: owner.userID },
            select: { id: true },
          })
        : null;
      if (!owned) {
        throw new AppError('VALIDATION_ERROR', 'addressId does not match one of your saved addresses');
      }
    }

    // For a signed-in order the contact name + email are authoritative from
    // the account — never whatever the client put in the body — so the admin
    // panel always sees the real customer identity. Guests supply their own.
    // Resolved early (before cart/stock work) since the blacklist and OTP
    // checks below both need it.
    const account = owner.userID
      ? await tx.user.findUnique({
          where: { id: owner.userID },
          select: { name: true, email: true, emailVerified: true, isActive: true },
        })
      : null;

    // A signed-in shopper who was blocked (or deleted) mid-session: the access
    // token is still valid for its short TTL, but the account is dead. Refuse
    // — same intent as the admin Customers "block" toggle, which flips
    // `isActive`. (Login / refresh already reject a blocked account; this
    // covers the in-flight token window.)
    if (owner.userID && (!account || !account.isActive)) {
      throw new AppError('FORBIDDEN', 'Your account has been blocked by an administrator.');
    }

    const deliveryName = account?.name ?? input.deliveryName;
    const contactEmail = account?.email ?? input.guestEmail ?? null;

    // Explicit, admin-maintained hard block — checked before any other work.
    // Distinct from the automatic order-velocity soft-flag below: this is a
    // deliberate admin decision, not a heuristic, so it refuses the order
    // outright rather than just flagging it.
    //
    // Two sources feed it: (1) BlacklistEntry rows an admin added by hand;
    // (2) a registered CUSTOMER account an admin blocked from the Customers
    // page — its `isActive` is false, and neither its email nor its phone may
    // be used to slip an order through as a guest.
    const emailLc = contactEmail?.toLowerCase() ?? null;
    const blockedContact = await tx.user.findFirst({
      where: {
        role: 'CUSTOMER',
        isActive: false,
        deletedAt: null,
        OR: [
          { phone: input.deliveryPhone },
          ...(emailLc ? [{ email: emailLc }] : []),
        ],
      },
      select: { id: true },
    });
    const blacklisted =
      Boolean(blockedContact) ||
      (await isBlacklisted('PHONE', input.deliveryPhone)) ||
      (contactEmail ? await isBlacklisted('EMAIL', contactEmail) : false) ||
      (input.ipAddress ? await isBlacklisted('IP', input.ipAddress) : false);
    if (blacklisted) {
      throw new AppError('FORBIDDEN', 'Unable to place this order. Contact support if you think this is a mistake.');
    }

    // Email OTP is required for a guest, or a logged-in shopper whose
    // account email isn't verified yet — skipped for an already-verified
    // logged-in shopper, who has already proven they own that inbox.
    const otpRequired = !(owner.userID && account?.emailVerified);
    if (otpRequired) {
      if (!input.emailVerifyToken || !contactEmail) {
        throw new AppError('VALIDATION_ERROR', 'Email verification required');
      }
      const otp = await tx.checkoutOtp.findUnique({
        where: { verifyTokenHash: hashToken(input.emailVerifyToken) },
      });
      const valid = Boolean(
        otp &&
          otp.verifiedAt &&
          otp.verifyTokenExpiresAt &&
          otp.verifyTokenExpiresAt > new Date() &&
          !otp.consumedAt &&
          otp.email === contactEmail
      );
      if (!valid || !otp) {
        throw new AppError('UNAUTHORIZED', 'Email verification expired or invalid — please verify again.');
      }
      // Consumed in the same transaction as order creation: if checkout
      // fails later for an unrelated reason (e.g. out of stock), the
      // rollback un-consumes it too, so the customer can retry without
      // verifying again.
      await tx.checkoutOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    }

    const cart = await tx.cart.findUnique({
      where: owner.userID ? { userID: owner.userID } : { sessionID: owner.sessionID! },
    });
    const cartItems = cart
      ? await tx.cartItem.findMany({
          where: { cartID: cart.id },
          include: {
            variant: { include: { product: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } } } },
          },
        })
      : [];
    if (cartItems.length === 0) throw new AppError('VALIDATION_ERROR', 'Cart is empty');

    // Preliminary, non-authoritative stock check — fast-fails with a friendly
    // per-line message in the common case. The ACTUAL guard is the atomic
    // conditional decrement after the order is created (see below): two
    // concurrent checkouts for the last unit would both pass this read-check
    // (READ COMMITTED), so it must not be the only gate.
    for (const item of cartItems) {
      if (item.variant.stockQuantity < item.quantity) {
        const label = [item.variant.size, item.variant.color].filter(Boolean).join('/') || 'one size';
        throw new AppError('OUT_OF_STOCK', `Not enough stock for ${item.variant.product.nameEn} (${label})`);
      }
    }

    // Effective unit price per line = variant override → product sale → best
    // active catalog discount. Snapshotted onto each OrderItem below so the
    // order stays correct even if a discount later ends.
    const discounts = await activeDiscounts();
    const unitPriceFor = (i: (typeof cartItems)[number]) => lineUnitPrice(i.variant, discounts);
    const subtotal = round2(
      cartItems.reduce((sum, i) => sum + unitPriceFor(i) * i.quantity, 0)
    );

    // Coupon: applied to the post-discount merchandise subtotal. A code that
    // was supplied but isn't valid right now rejects the checkout rather than
    // silently ignoring it (so the shopper isn't surprised by the total).
    let couponCode: string | null = null;
    let discountAmount = 0;
    let couponToRedeem: { id: string; maxRedemptions: number | null } | null = null;
    if (input.couponCode) {
      const coupon = await resolveCoupon(input.couponCode);
      if (!coupon) throw new AppError('VALIDATION_ERROR', 'That coupon code is not valid.');

      // Per-customer cap (V2b). `maxPerCustomer` defaults to 1 (single use
      // per customer) — null only when an admin explicitly made it unlimited.
      // A logged-in shopper is matched by BOTH account id and contact email
      // (so "once as a guest, again logged in" with the same inbox is still
      // caught); a guest by email alone.
      //
      // The owner advisory lock at the top of this transaction already
      // serializes one account's / one session's concurrent checkouts. This
      // second lock — keyed on (coupon, identity) — also covers the one path
      // the owner lock can't see: the same person redeeming as a logged-in
      // shopper AND as a guest with the same email at the same instant (two
      // different owner keys, one identity). With both locks the count below
      // is race-free; the GLOBAL `maxRedemptions` cap stays enforced by its
      // own atomic guarded increment further down.
      if (coupon.maxPerCustomer != null) {
        const identity: Prisma.CouponRedemptionWhereInput[] = [];
        if (owner.userID) identity.push({ userID: owner.userID });
        if (contactEmail) identity.push({ email: contactEmail });
        if (identity.length) {
          const idKey = (contactEmail ?? owner.userID ?? '').toLowerCase();
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`coupon:${coupon.id}:${idKey}`}), 42)`;
        }
        const used = identity.length
          ? await tx.couponRedemption.count({ where: { couponID: coupon.id, OR: identity } })
          : 0;
        if (used >= coupon.maxPerCustomer) {
          throw new AppError('VALIDATION_ERROR', "You've already used this coupon the maximum number of times.");
        }
      }

      couponCode = coupon.code;
      discountAmount = couponAmountOff(coupon, subtotal);
      couponToRedeem = { id: coupon.id, maxRedemptions: coupon.maxRedemptions };
    }

    // Admin-configured delivery fee (flat, per-region override, or free by
    // threshold / free-region list — see lib/delivery-fee.ts). Assessed on the
    // merchandise subtotal before the coupon.
    const cfg = await loadDeliveryConfig(tx);
    if (!knownRegions(cfg).has(input.deliveryRegion)) {
      throw new AppError('VALIDATION_ERROR', `Unknown delivery region: ${input.deliveryRegion}`);
    }
    const { fee: deliveryFee } = resolveDeliveryFee(cfg, subtotal, input.deliveryRegion);
    const total = round2(subtotal - discountAmount + deliveryFee);

    // Automatic order-velocity soft-flag: counts every existing order in the
    // trailing window for this phone/email/IP (regardless of status — a
    // cancelled-after-caught pattern is still evidence). Crossing any
    // threshold flags the order for admin review; it's still created
    // normally either way.
    const since = new Date(Date.now() - VELOCITY_WINDOW_MS);
    const [phoneCount, emailCount, ipCount] = await Promise.all([
      tx.order.count({ where: { deliveryPhone: input.deliveryPhone, dateCreated: { gt: since } } }),
      contactEmail
        ? tx.order.count({ where: { guestEmail: contactEmail, dateCreated: { gt: since } } })
        : Promise.resolve(0),
      input.ipAddress
        ? tx.order.count({ where: { ipAddress: input.ipAddress, dateCreated: { gt: since } } })
        : Promise.resolve(0),
    ]);
    const flagReasons: string[] = [];
    // +1 counts the order being created right now — e.g. VELOCITY_PHONE_MAX
    // of 3 flags on the 3rd order for that phone (2 prior + this one), not
    // only once a 4th shows up.
    if (phoneCount + 1 >= VELOCITY_PHONE_MAX) flagReasons.push('velocity:phone');
    if (emailCount + 1 >= VELOCITY_EMAIL_MAX) flagReasons.push('velocity:email');
    if (ipCount + 1 >= VELOCITY_IP_MAX) flagReasons.push('velocity:ip');
    const flaggedForReview = flagReasons.length > 0;
    const flaggedReason = flaggedForReview ? flagReasons.join(',') : null;

    const order = await tx.order.create({
      data: {
        orderNumber: await generateUniqueOrderNumber(tx),
        userID: owner.userID,
        addressID: input.addressId,
        guestEmail: contactEmail,
        ipAddress: input.ipAddress,
        flaggedForReview,
        flaggedReason,
        deliveryName,
        deliveryPhone: input.deliveryPhone,
        deliveryAddress: input.deliveryAddress,
        deliveryCity: input.deliveryCity,
        deliveryRegion: input.deliveryRegion,
        deliveryArea: input.deliveryArea,
        deliveryNotes: input.deliveryNotes,
        notes: input.notes,
        subtotal,
        couponCode,
        discountAmount,
        deliveryFee,
        total,
        paymentMethod: 'COD',
        items: {
          create: cartItems.map((i) => {
            const unitPrice = unitPriceFor(i);
            return {
              variantID: i.variantID,
              productName: i.variant.product.nameEn,
              productSKU: i.variant.product.sku,
              variantSKU: i.variant.sku,
              productImageUrl: i.variant.product.images[0]?.url ?? null,
              size: i.variant.size,
              color: i.variant.color,
              quantity: i.quantity,
              unitPrice,
              lineTotal: round2(unitPrice * i.quantity),
            };
          }),
        },
      },
      include: { items: true },
    });

    // Coupon redemption (V2b). The global cap is claimed with an atomic
    // guarded increment — same shape as the stock claim: the predicate and
    // the +1 happen in one UPDATE, so concurrent checkouts can't push
    // `timesRedeemed` past `maxRedemptions`. 0 rows affected => the code was
    // exhausted between resolveCoupon() and here => roll the order back.
    if (couponToRedeem) {
      const bumped = await tx.$executeRaw`
        UPDATE "coupon"
           SET "timesRedeemed" = "timesRedeemed" + 1
         WHERE "id" = ${couponToRedeem.id}::uuid
           AND ("maxRedemptions" IS NULL OR "timesRedeemed" < "maxRedemptions")
      `;
      if (bumped === 0) {
        throw new AppError('VALIDATION_ERROR', 'That coupon code is no longer available.');
      }
      await tx.couponRedemption.create({
        data: {
          couponID: couponToRedeem.id,
          orderID: order.id,
          userID: owner.userID ?? null,
          email: contactEmail,
        },
      });
    }

    for (const item of cartItems) {
      // Atomic, race-safe stock claim: the `stockQuantity: { gte }` predicate
      // and the decrement happen in one UPDATE, and Postgres row-locks the
      // matched row for the rest of the transaction. If another concurrent
      // checkout already took the last unit, `count` is 0 here and we roll
      // the whole order back — stock can never go negative, never oversell.
      const claimed = await tx.productVariant.updateMany({
        where: { id: item.variantID, stockQuantity: { gte: item.quantity } },
        data: { stockQuantity: { decrement: item.quantity } },
      });
      if (claimed.count === 0) {
        const label = [item.variant.size, item.variant.color].filter(Boolean).join('/') || 'one size';
        throw new AppError('OUT_OF_STOCK', `Not enough stock for ${item.variant.product.nameEn} (${label})`);
      }
      await tx.stockMovement.create({
        data: {
          variantID: item.variantID,
          quantity: -item.quantity,
          type: 'SALE',
          orderID: order.id,
          reason: `Order ${order.orderNumber}`,
        },
      });
    }

    if (cart) await tx.cartItem.deleteMany({ where: { cartID: cart.id } });

    // A signed-in shopper who typed a fresh address (no saved-address ref):
    // keep it in their address book for next time. First one becomes default.
    if (owner.userID && input.saveAddress && !input.addressId) {
      const existingCount = await tx.address.count({ where: { userID: owner.userID } });
      await tx.address.create({
        data: {
          userID: owner.userID,
          fullName: deliveryName,
          phone: input.deliveryPhone,
          addressLine: input.deliveryAddress,
          city: input.deliveryCity,
          region: input.deliveryRegion,
          area: input.deliveryArea ?? null,
          notes: input.deliveryNotes ?? null,
          isDefault: existingCount === 0,
        },
      });
    }

    // Only a guest order needs a bearer-token tracking link — a logged-in
    // customer already has a real session and /orders/[id]; minting one for
    // them would just be an unnecessary extra credential. Minted in the
    // same transaction as the order itself, so it can never exist without a
    // real order behind it.
    if (!owner.userID) {
      rawAccessToken = await mintAccessToken(tx, order.id);
    }

    return order;
  }, CHECKOUT_TX_OPTIONS);

  if (order.flaggedForReview) {
    await recordAudit({
      entityType: 'order',
      entityID: order.id,
      action: 'order.flagged',
      metadata: { orderNumber: order.orderNumber, reason: order.flaggedReason },
    });
  }

  // Fired after the transaction commits — never before, so a customer can
  // never be emailed order confirmation for an order that then rolls back,
  // and a slow SMTP call can never hold the DB transaction open. Never
  // throws (see notification.service.ts), so a delivery failure can't
  // affect this response either.
  const orderUrl = rawAccessToken ? trackingUrl(rawAccessToken) : accountOrderUrl(order.id);
  void sendOrderPlacedNotifications(order, orderUrl).catch((err) => {
    console.error('[order.service] failed to send order-placed notifications', err);
  });

  return order;
}

export async function listMyOrders(userID: string) {
  return prisma.order.findMany({
    where: { userID },
    orderBy: { dateCreated: 'desc' },
    include: { items: true },
  });
}

export async function getOrderById(id: string, userID?: string) {
  const order = await prisma.order.findFirst({
    where: { id, ...(userID ? { userID } : {}) },
    include: { items: true, address: true },
  });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');
  return order;
}

/**
 * The one place that actually cancels an order: restores stock (one
 * incremented ProductVariant + one RETURN StockMovement per line, symmetric
 * with checkout's SALE-type decrement) and flips status to CANCELLED, all in
 * one transaction. Every caller — the customer's own cancel button, a
 * guest's token-based cancel, and the admin status dropdown when the target
 * status is CANCELLED — routes through this, so there is exactly one
 * cancellation implementation instead of several.
 *
 * `enforceCancellableGate` is what actually differs between them: a
 * customer/guest can only cancel PENDING/CONFIRMED orders (before SHIPPED);
 * an admin can force-cancel from any non-CANCELLED status (e.g. a
 * return-to-sender after shipping), so the admin path passes `false`.
 */
async function performCancellation(
  id: string,
  opts: { enforceCancellableGate: boolean }
): Promise<{ order: OrderWithItems; previousStatus: OrderStatus }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({ where: { id }, include: { items: true } });
    if (!existing) throw new AppError('NOT_FOUND', 'Order not found');
    if (existing.status === 'CANCELLED') {
      throw new AppError('CONFLICT', 'This order is already cancelled');
    }
    if (opts.enforceCancellableGate && !CANCELLABLE_STATUSES.includes(existing.status)) {
      throw new AppError('CONFLICT', 'This order can no longer be cancelled');
    }

    for (const item of existing.items) {
      await tx.productVariant.update({
        where: { id: item.variantID },
        data: { stockQuantity: { increment: item.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          variantID: item.variantID,
          quantity: item.quantity,
          type: 'RETURN',
          orderID: existing.id,
          reason: `Order ${existing.orderNumber} cancelled`,
        },
      });
    }

    const order = await tx.order.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: { items: true },
    });
    return { order, previousStatus: existing.status };
  });
}

/** Audit + notification side effects shared by every cancellation path —
 *  called after performCancellation's transaction has committed, same
 *  fire-and-forget-notifications-after-commit discipline as checkout(). */
async function finishCancellation(
  order: OrderWithItems,
  previousStatus: OrderStatus,
  ctx: { actorID?: string; via: 'customer' | 'guest_token' | 'admin' }
): Promise<void> {
  await recordAudit({
    entityType: 'order',
    entityID: order.id,
    action: 'order.cancelled',
    actorID: ctx.actorID ?? null,
    metadata: { orderNumber: order.orderNumber, from: previousStatus, via: ctx.via },
  });
  void sendOrderCancelledNotifications(order).catch((err) => {
    console.error('[order.service] failed to send order-cancelled notifications', err);
  });
}

/** Session-based cancellation — the logged-in customer's own cancel button. */
export async function cancelOrder(id: string, userID: string) {
  const owned = await prisma.order.findFirst({ where: { id, userID }, select: { id: true } });
  if (!owned) throw new AppError('NOT_FOUND', 'Order not found');
  const { order, previousStatus } = await performCancellation(id, { enforceCancellableGate: true });
  await finishCancellation(order, previousStatus, { actorID: userID, via: 'customer' });
  return order;
}

/** Token-based cancellation — a guest's tracking-page cancel button, proven
 *  by the OrderAccessToken instead of a login session. Same generic
 *  NOT_FOUND for "no such token" and "expired token" as getOrderByToken. */
export async function cancelOrderByToken(rawToken: string) {
  const record = await findValidAccessToken(rawToken);
  if (!record) throw new AppError('NOT_FOUND', 'Order not found');
  const { order, previousStatus } = await performCancellation(record.orderID, {
    enforceCancellableGate: true,
  });
  await finishCancellation(order, previousStatus, { via: 'guest_token' });
  return order;
}

/** GET /api/orders/track/:token — the guest tracking view. Same generic
 *  NOT_FOUND whether the token is wrong or merely expired; never reveals
 *  which. */
export async function getOrderByToken(rawToken: string): Promise<OrderWithItems> {
  const record = await findValidAccessToken(rawToken);
  if (!record) throw new AppError('NOT_FOUND', 'Order not found');
  return record.order;
}

/**
 * POST /api/orders/lookup — the manual fallback when a guest doesn't have
 * (or lost) their tracking link. `null` on any mismatch — wrong order
 * number, right order number but wrong contact, or no such order at all all
 * collapse to the exact same outcome here, so the caller can respond with
 * one generic message regardless (same enumeration-resistance principle as
 * password-reset / admin-login's uniform rejections). On a match, mints a
 * *fresh* OrderAccessToken rather than trying to recover whichever one was
 * emailed at checkout — that hash is one-way, so there's nothing to
 * recover — which is also why this never disturbs the original link.
 */
export async function lookupOrder(orderNumber: string, contact: string): Promise<string | null> {
  const order = await prisma.order.findFirst({
    where: { orderNumber, OR: [{ guestEmail: contact }, { deliveryPhone: contact }] },
    select: { id: true },
  });
  if (!order) return null;
  return mintAccessToken(prisma, order.id);
}

// ---- Admin ----

export async function listAllOrders(status?: OrderStatus, flagged?: boolean) {
  return prisma.order.findMany({
    where: { ...(status ? { status } : {}), ...(flagged ? { flaggedForReview: true } : {}) },
    orderBy: { dateCreated: 'desc' },
    include: { items: true, user: { select: { id: true, name: true, email: true, phone: true } } },
  });
}

/** Clears a flagged order's review flag once an admin has looked at it.
 *  Keeps the original `order.flagged` audit row as permanent history —
 *  this just records that it was reviewed and dismissed. */
export async function reviewOrder(id: string, actorId?: string) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');
  const updated = await prisma.order.update({
    where: { id },
    data: { flaggedForReview: false },
  });
  await recordAudit({
    entityType: 'order',
    entityID: id,
    action: 'order.flag_cleared',
    actorID: actorId,
    metadata: { orderNumber: order.orderNumber, reason: order.flaggedReason },
  });
  return updated;
}

interface UpdateOrderStatusOptions {
  /** Admin-set "arrives in about N days" estimate. undefined ⇒ leave as-is;
   *  null ⇒ clear it. */
  estimatedDeliveryDays?: number | null;
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  actorId?: string,
  opts: UpdateOrderStatusOptions = {}
) {
  // Cancelling is not a plain field update — it has to restore stock, same
  // as the customer-facing cancel button. Route through the shared core
  // (unbounded by CANCELLABLE_STATUSES: an admin can force-cancel from any
  // status, e.g. a return-to-sender after shipping) instead of the blind
  // update below, which would otherwise silently lose stock.
  if (status === 'CANCELLED') {
    const { order, previousStatus } = await performCancellation(id, { enforceCancellableGate: false });
    await finishCancellation(order, previousStatus, { actorID: actorId, via: 'admin' });
    return order;
  }

  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');

  const updated = await prisma.order.update({
    where: { id },
    data: {
      status,
      ...(opts.estimatedDeliveryDays !== undefined
        ? { estimatedDeliveryDays: opts.estimatedDeliveryDays }
        : {}),
    },
    include: { items: true },
  });
  await recordAudit({
    entityType: 'order',
    entityID: id,
    action: 'order.status_changed',
    actorID: actorId,
    metadata: {
      orderNumber: order.orderNumber,
      from: order.status,
      to: status,
      ...(opts.estimatedDeliveryDays !== undefined
        ? { estimatedDeliveryDays: opts.estimatedDeliveryDays }
        : {}),
    },
  });

  // Email the customer the first time an order enters SHIPPED (not on a
  // re-select of the same status). Fire-and-forget, after commit, never
  // throws — same discipline as the order-placed / cancelled notifications.
  if (status === 'SHIPPED' && order.status !== 'SHIPPED') {
    void sendOrderShippedNotifications(updated).catch((err) => {
      console.error('[order.service] failed to send order-shipped notification', err);
    });
  }

  return updated;
}

export async function markCodCollected(id: string, collected: boolean, actorId?: string) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');
  const nextPaymentStatus = collected ? 'COLLECTED' : 'PENDING';
  const updated = await prisma.order.update({
    where: { id },
    data: { paymentStatus: nextPaymentStatus },
  });
  await recordAudit({
    entityType: 'order',
    entityID: id,
    action: collected ? 'order.payment_collected' : 'order.payment_uncollected',
    actorID: actorId,
    metadata: { orderNumber: order.orderNumber, from: order.paymentStatus, to: nextPaymentStatus },
  });
  return updated;
}

// A variant with 1..LOW_STOCK_THRESHOLD units left counts as "low stock" on the
// dashboard tile; matches the analytics module's default lowStockThreshold.
const LOW_STOCK_THRESHOLD = 5;

export async function salesDashboard() {
  const [
    totalOrders,
    pendingOrders,
    deliveredRevenue,
    flaggedOrders,
    awaitingCodCollection,
    lowStockVariants,
    outOfStockVariants,
    recentOrders,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: 'PENDING' } }),
    // Merchandise revenue — excludes the delivery fee (tracked separately).
    prisma.order.aggregate({ where: { status: 'DELIVERED' }, _sum: { subtotal: true } }),
    // Orders an anti-abuse velocity check flagged and no admin has cleared yet.
    prisma.order.count({ where: { flaggedForReview: true } }),
    // Delivered COD orders where the cash hasn't been marked collected.
    prisma.order.count({
      where: { paymentMethod: 'COD', paymentStatus: 'PENDING', status: 'DELIVERED' },
    }),
    prisma.productVariant.count({
      where: { stockQuantity: { gt: 0, lte: LOW_STOCK_THRESHOLD }, product: { deletedAt: null } },
    }),
    prisma.productVariant.count({
      where: { stockQuantity: { lte: 0 }, product: { deletedAt: null } },
    }),
    prisma.order.findMany({
      orderBy: { dateCreated: 'desc' },
      take: 8,
      select: {
        id: true,
        orderNumber: true,
        deliveryName: true,
        total: true,
        discountAmount: true,
        couponCode: true,
        status: true,
        paymentStatus: true,
        flaggedForReview: true,
        dateCreated: true,
      },
    }),
  ]);
  return {
    totalOrders,
    pendingOrders,
    totalRevenue: Number(deliveredRevenue._sum.subtotal ?? 0),
    flaggedOrders,
    awaitingCodCollection,
    lowStockVariants,
    outOfStockVariants,
    recentOrders,
  };
}
