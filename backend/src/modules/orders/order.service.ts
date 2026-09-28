import { createWholeOrderReturn } from '../returns/return-records';
import { merchandiseSummary } from '../../lib/merchandise-metrics';
import { publicOrder } from '../../lib/public-return';
import { indicatorsFromRecords, readReturnIndicators, withReturnIndicators, type OrderReturnFilter } from '../../lib/order-return-indicators';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../lib/AppError';
import { generateUniqueOrderNumber } from '../../lib/orderNumber';
import { recordAudit } from '../../lib/audit';
import {
  sendOrderPlacedNotifications,
  sendOrderConfirmedNotifications,
  sendOrderCancelledNotifications,
  sendOrderShippedNotifications,
  sendOwnerFlaggedNotification,
} from '../../lib/notifications/notification.service';
import { isBlacklisted } from '../blacklist/blacklist.service';
import { activePromotions } from '../discounts/promotion.service';
import { activeComboRules } from '../combos/combo-rule.service';
import { resolveCoupon, couponAmountOff } from '../discounts/coupon.service';
import { lineUnitPrice } from '../../lib/line-pricing';
import { priceMerchandise, type BundlePricingLine } from '../../lib/bundle-pricing';
import { activeBundles } from '../bundles/bundle.service';
import { checkoutItemPrices } from '../../lib/checkout-pricing';
import { PROMOTION_PRODUCT_INCLUDE, productCategoryPaths, productCollectionIds } from '../catalog/category-tree';
import { round2 } from '../../lib/money';
import {
  resolveDeliveryFee,
  toDeliveryConfig,
  type DeliveryConfig,
} from '../../lib/delivery-fee';
import { REGION_VALUES } from '../../lib/regions';
import { checkLoyaltyThreshold } from '../loyalty/loyalty.service';
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
  pricingMode?: 'BUNDLE' | 'COUPON';
  expectedTotal?: number;
  /** The merchandise subtotal the client's cart view last showed the
   *  shopper. When present, checked against the freshly-computed subtotal
   *  below and the checkout rejected on mismatch — see the comment at that
   *  check for why. */
  expectedSubtotal?: number;
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

// Hard cap on top of the soft flag above — crossing one of these actually
// refuses the order instead of just marking it for review. Set well above
// the flag thresholds so a normal repeat shopper (or a family sharing one
// phone/IP) only ever gets flagged, never blocked; a burst of automated or
// bad-faith orders past this point gets refused before it can tie up any
// more real stock.
const VELOCITY_BLOCK_PHONE_MAX = 6;
const VELOCITY_BLOCK_EMAIL_MAX = 6;
const VELOCITY_BLOCK_IP_MAX = 10;

// Checkout is the heaviest transaction in the app (address check, cart load,
// discount resolution, order + N line items, velocity counts, per-line stock
// claim, coupon redemption). Under a burst of shoppers hitting the same
// popular variant the atomic stock/coupon row-claims serialize, so the last
// checkout in line can wait well past Prisma's default 5s ceiling — which would
// surface as a 500 rather than an orderly "sold out". These give that queue
// real headroom without letting a genuinely stuck transaction hang forever.
//
// `timeout` raised from 20s (fix-list.md #11, resolves 1.8): live-tested a
// 50-concurrent-buyer burst against one 10-unit variant (paired with the
// connection_limit bump — see .env.example) and 20s still wasn't enough
// headroom — Prisma killed every one of the 50 with P2028 ("transaction
// already closed") right around the 20s mark, even though the failure was
// genuinely the row-lock queue for the stock claim draining, not a stuck or
// runaway transaction. 45s gave the same 50-buyer burst room to fully drain
// cleanly (10 succeed, 40 clean 409 OUT_OF_STOCK, 0 errors) — see
// reports/batch6-log.md for the before/after numbers. `maxWait` (time to
// acquire a pooled connection at all) is unaffected by this — a separate
// concern from the connection pool size, not this timeout.
const CHECKOUT_TX_OPTIONS = { timeout: 45_000, maxWait: 10_000 } as const;

// A customer (or a guest bearing a valid access token) may cancel their own
// order up to — but not including — SHIPPED. An admin isn't bound by this;
// see performCancellation's `enforceCancellableGate`.
const CANCELLABLE_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED'];

// How long an OrderAccessToken stays valid, however it was issued (minted
// when an admin confirms the order, for the confirmation email, or freshly
// minted by /orders/lookup). Generous enough that "let me check on last
// month's order" always works; bounded so a leaked link (browser history,
// forwarded email) doesn't stay exploitable forever. Expired ⇒ the guest
// just uses /orders/lookup again.
const ORDER_ACCESS_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Mints a fresh guest access token for `orderId` and returns the raw value
 *  — only its hash is ever stored. Called both from updateOrderStatus()'s
 *  CONFIRMED branch (the token in the confirmation email) and standalone
 *  from lookupOrder() (a freshly re-issued one) — each call always creates
 *  a new row, never touching any token already issued for the same order. */
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
 *  the tracking view, token-based cancellation, and (exported) the token-
 *  based return-request routes in return.service.ts — a token is never
 *  single-use, so no "consumed" bookkeeping here (unlike CheckoutOtp). */
export async function findValidAccessToken(rawToken: string) {
  return prisma.orderAccessToken.findFirst({
    where: { tokenHash: hashToken(rawToken), expiresAt: { gt: new Date() } },
    include: { order: { include: { items: true, returns: { include: { items: true, payout: true } }, goodwillRefunds: true } } },
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

async function loadCartPricing(db: DbClient, owner: CheckoutOwner) {
  const cart = await db.cart.findUnique({
    where: owner.userID ? { userID: owner.userID } : { sessionID: owner.sessionID! },
  });
  if (!cart) return priceMerchandise([], [], []);
  const [items, promotions, comboRules, bundles] = await Promise.all([
    db.cartItem.findMany({
      where: { cartID: cart.id },
      orderBy: { id: 'asc' },
      include: {
        variant: {
          select: {
            price: true,
            product: {
              select: {
                id: true,
                price: true,
                saleType: true,
                saleValue: true,
                ...PROMOTION_PRODUCT_INCLUDE,
              },
            },
          },
        },
      },
    }),
    activePromotions(undefined, db),
    activeComboRules(undefined, db),
    activeBundles(undefined, db),
  ]);
  // Same priceMerchandise() pass checkout() itself runs below, on the same
  // promotion, volume-pricing and Bundle inputs — this is what keeps
  // the GET /api/orders/delivery-quote estimate and checkout()'s own
  // recomputed subtotal from ever drifting apart (see the design plan's Q3).
  const comboLines: BundlePricingLine[] = items.map((i) => ({
    lineId: i.id,
    variantID: i.variantID,
    productId: i.variant.product.id,
    categoryPaths: productCategoryPaths(i.variant.product),
    collectionIds: productCollectionIds(i.variant.product),
    quantity: i.quantity,
    individualUnitPrice: lineUnitPrice(i.variant, promotions),
  }));
  return priceMerchandise(comboLines, comboRules, bundles);
}

/** Live delivery-fee estimate for the caller's current cart + a chosen
 *  governorate. Powers the checkout form's order summary. */
export async function getDeliveryQuote(owner: CheckoutOwner, region: string, choices: { couponCode?: string; pricingMode?: 'BUNDLE' | 'COUPON' } = {}) {
  if (!owner.userID && !owner.sessionID) {
    return { subtotal: 0, deliveryFee: 0, total: 0, freeReason: 'disabled' as const };
  }
  const [pricing, cfg] = await Promise.all([
    loadCartPricing(prisma, owner),
    loadDeliveryConfig(prisma),
  ]);
  const quote = (subtotal: number, discountAmount: number, units: Map<string, number[]>) => {
    const { fee, freeReason } = resolveDeliveryFee(cfg, subtotal, region);
    const lines = [...units].map(([id, cents]) => ({ id, cents: cents.reduce((sum, unit) => sum + unit, 0) }));
    return { subtotal, discountAmount, deliveryFee: fee, total: round2(subtotal - discountAmount + fee), freeReason,
      items: lines.map((line) => ({ id: line.id, lineTotal: line.cents / 100 })) };
  };
  const bundle = quote(pricing.subtotal, 0, pricing.lineUnitPricesCents);
  const coupon = choices.couponCode ? await resolveCoupon(choices.couponCode) : null;
  if (choices.couponCode && !coupon) throw new AppError('VALIDATION_ERROR', 'That coupon code is not valid.');
  const ordinary = quote(pricing.ordinarySubtotal, coupon ? couponAmountOff(coupon, pricing.ordinarySubtotal) : 0, pricing.ordinaryLineUnitPricesCents);
  const mode = choices.pricingMode ?? (choices.couponCode ? 'COUPON' : 'BUNDLE');
  return { ...(mode === 'COUPON' ? ordinary : bundle), pricingMode: mode,
    options: { bundle, coupon: ordinary }, hasBundles: pricing.appliedBundles.length > 0,
    bundles: pricing.appliedBundles.map(({ id, nameEn, nameAr, instanceCount }) => ({ id, nameEn, nameAr, instanceCount })) };
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
    //
    // All of these run on `tx` (the transaction's own connection) — otherwise
    // each concurrent checkout borrows extra pool connections while holding the
    // tx open, doubling connection demand and causing P2024/P2028 timeout
    // cascades under a burst (see the production-readiness audit).
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
      (await isBlacklisted('PHONE', input.deliveryPhone, tx)) ||
      (contactEmail ? await isBlacklisted('EMAIL', contactEmail, tx) : false) ||
      (input.ipAddress ? await isBlacklisted('IP', input.ipAddress, tx) : false);
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
          // Stable tie-breaking for combo and coupon cent allocations.
          orderBy: { id: 'asc' },
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    images: { orderBy: { sortOrder: 'asc' }, take: 1 },
                    ...PROMOTION_PRODUCT_INCLUDE,
                  },
                },
              },
            },
          },
        })
      : [];
    if (cartItems.length === 0) throw new AppError('VALIDATION_ERROR', 'Cart is empty');

    // Preliminary, non-authoritative checks — fast-fail with a friendly
    // per-line message in the common case. The ACTUAL guards are the atomic
    // conditional decrement after the order is created (see below), which
    // re-checks both stock AND that the product is still active/undeleted:
    // two concurrent checkouts for the last unit would both pass a plain
    // read-check (READ COMMITTED), and a product can be archived or hard-
    // deleted at any point up to that same instant, so neither can be the
    // only gate.
    for (const item of cartItems) {
      const label = [item.variant.size, item.variant.color].filter(Boolean).join('/') || 'one size';
      if (item.variant.product.deletedAt || !item.variant.product.isActive) {
        throw new AppError('OUT_OF_STOCK', `${item.variant.product.nameEn} (${label}) is no longer available`);
      }
      if (item.variant.stockQuantity < item.quantity) {
        throw new AppError('OUT_OF_STOCK', `Not enough stock for ${item.variant.product.nameEn} (${label})`);
      }
    }

    // Effective price per line = variant override → product sale → best
    // (single, priority-picked) active promotion → best (single,
    // priority-picked) active ComboRule quantity band, whichever of the combo
    // and individual paths is cheaper (see lib/combo-pricing.ts). Snapshotted
    // onto each OrderItem below so the order stays correct even if a
    // promotion or combo rule later changes. `tx` — same pool reason as the
    // blacklist check above.
    const [promotions, comboRules, bundles] = await Promise.all([
      activePromotions(new Date(), tx),
      activeComboRules(new Date(), tx),
      activeBundles(new Date(), tx),
    ]);
    const comboLines: BundlePricingLine[] = cartItems.map((i) => ({
      lineId: i.id,
      variantID: i.variantID,
      productId: i.variant.product.id,
      categoryPaths: productCategoryPaths(i.variant.product),
      collectionIds: productCollectionIds(i.variant.product),
      quantity: i.quantity,
      individualUnitPrice: lineUnitPrice(i.variant, promotions),
    }));
    const mode = input.pricingMode ?? (input.couponCode ? 'COUPON' : 'BUNDLE');
    if (mode === 'BUNDLE' && input.couponCode) throw new AppError('VALIDATION_ERROR', 'Bundle pricing and coupons cannot be combined', { reason: 'BUNDLE_COUPON_EXCLUSIVE' });
    const priced = priceMerchandise(comboLines, comboRules, bundles, mode !== 'COUPON');
    const subtotal = priced.subtotal;

    // If the client told us what subtotal its cart view last showed the
    // shopper, and that no longer matches what we'd actually charge (e.g. an
    // admin edited a price, or a sale/discount started or ended, between
    // "add to cart" and "place order"), refuse rather than silently charging
    // the new number — the shopper gets a clear signal to review and
    // re-confirm instead of finding out on their bank/cash total. Never
    // trusted as the charged price either way: `subtotal` above is always
    // recomputed live from the DB.
    if (input.expectedSubtotal != null && round2(input.expectedSubtotal) !== subtotal) {
      throw new AppError(
        'CONFLICT',
        'Prices in your cart changed since you last viewed it. Please review your order and try again.',
        { reason: 'PRICE_CHANGED', expectedSubtotal: input.expectedSubtotal, actualSubtotal: subtotal }
      );
    }

    // Coupon: applied to the post-discount merchandise subtotal. A code that
    // was supplied but isn't valid right now rejects the checkout rather than
    // silently ignoring it (so the shopper isn't surprised by the total).
    let couponCode: string | null = null;
    let discountAmount = 0;
    let couponToRedeem: { id: string; maxRedemptions: number | null } | null = null;
    if (input.couponCode) {
      const coupon = await resolveCoupon(input.couponCode, new Date(), tx);
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

    const itemPrices = checkoutItemPrices(priced, discountAmount);

    // Admin-configured delivery fee (flat, per-region override, or free by
    // threshold / free-region list — see lib/delivery-fee.ts). Assessed on the
    // merchandise subtotal before the coupon.
    const cfg = await loadDeliveryConfig(tx);
    if (!knownRegions(cfg).has(input.deliveryRegion)) {
      throw new AppError('VALIDATION_ERROR', `Unknown delivery region: ${input.deliveryRegion}`);
    }
    const { fee: deliveryFee } = resolveDeliveryFee(cfg, subtotal, input.deliveryRegion);
    const total = round2(subtotal - discountAmount + deliveryFee);
    if (input.expectedTotal != null && round2(input.expectedTotal) !== total) {
      throw new AppError('CONFLICT', 'Prices in your cart changed since you last viewed it. Please review your order and try again.',
        { reason: 'PRICE_CHANGED', expectedTotal: input.expectedTotal, actualTotal: total });
    }

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

    // Hard cap: past this point it's no longer "flag for review", it's
    // "refuse outright" — see the constants' comment above. Checked after
    // the flag (so a blocked attempt would have been flagged too, had it
    // gotten further) but before the order is created, so a blocked burst
    // never touches stock at all.
    if (
      phoneCount + 1 >= VELOCITY_BLOCK_PHONE_MAX ||
      (contactEmail && emailCount + 1 >= VELOCITY_BLOCK_EMAIL_MAX) ||
      (input.ipAddress && ipCount + 1 >= VELOCITY_BLOCK_IP_MAX)
    ) {
      throw new AppError(
        'RATE_LIMITED',
        'Too many orders placed recently. Please try again later or contact support.'
      );
    }

    const orderItemIDs = new Map(cartItems.map((item) => [item.id, randomUUID()]));
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
            return {
              id: orderItemIDs.get(i.id)!,
              variantID: i.variantID,
              productName: i.variant.product.nameEn,
              productSKU: i.variant.product.sku,
              variantSKU: i.variant.sku,
              productImageUrl: i.variant.product.images[0]?.url ?? null,
              size: i.variant.size,
              color: i.variant.color,
              quantity: i.quantity,
              ...itemPrices.get(i.id)!,
            };
          }),
        },
      },
      include: { items: true },
    });

    for (const bundle of priced.appliedBundles) {
      await tx.orderBundle.create({ data: {
        orderID: order.id, bundleID: bundle.id, nameEn: bundle.nameEn, nameAr: bundle.nameAr,
        flatPrice: (bundle.priceCents / 100).toFixed(2), instanceCount: bundle.instanceCount,
        components: { create: bundle.components.map((c) => ({
          orderItemID: orderItemIDs.get(c.lineId)!, variantID: c.variantID,
          requiredQuantity: c.quantity, bundledQuantity: c.unitIndices.length,
          individualPrice: (c.individualPriceCents / 100).toFixed(2), unitIndices: c.unitIndices,
        })) },
      } });
    }

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
      // The `product: { isActive, deletedAt }` predicate is the authoritative
      // twin of the preliminary check above: an admin archiving or
      // hard-deleting the product in the instant between that check and this
      // claim fails the same way a stock race does, instead of completing
      // the sale of a product that no longer (visibly) exists.
      const claimed = await tx.productVariant.updateMany({
        where: {
          id: item.variantID,
          stockQuantity: { gte: item.quantity },
          product: { isActive: true, deletedAt: null },
        },
        data: { stockQuantity: { decrement: item.quantity } },
      });
      if (claimed.count === 0) {
        const label = [item.variant.size, item.variant.color].filter(Boolean).join('/') || 'one size';
        throw new AppError('OUT_OF_STOCK', `${item.variant.product.nameEn} (${label}) is no longer available`);
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

    return order;
  }, CHECKOUT_TX_OPTIONS);

  if (order.flaggedForReview) {
    await recordAudit({
      entityType: 'order',
      entityID: order.id,
      action: 'order.flagged',
      metadata: { orderNumber: order.orderNumber, reason: order.flaggedReason },
    });
    void sendOwnerFlaggedNotification(order).catch((err) => {
      console.error('[order.service] failed to send order-flagged notification', err);
    });
  }

  // Owner-side alert only — the customer isn't emailed a confirmation until
  // an admin actually confirms the order (see updateOrderStatus()'s
  // CONFIRMED branch below), so a fraudulent/mistaken order never reaches
  // the customer's inbox before someone has looked at it. Fired after the
  // transaction commits — never before, so this can't fire for an order
  // that then rolls back, and a slow send can never hold the DB transaction
  // open. Never throws (see notification.service.ts), so a delivery
  // failure can't affect this response either.
  void sendOrderPlacedNotifications(order).catch((err) => {
    console.error('[order.service] failed to send order-placed notifications', err);
  });

  return order;
}

export async function listMyOrders(userID: string) {
  const orders = await prisma.order.findMany({
    where: { userID },
    orderBy: { dateCreated: 'desc' },
    include: { items: true },
  });
  return (await withReturnIndicators(orders)).map(publicOrder);
}

export async function getOrderById(id: string, userID?: string) {
  const order = await prisma.order.findFirst({
    where: { id, ...(userID ? { userID } : {}) },
    include: { items: true, address: true, returns: { include: { items: true, payout: true } }, goodwillRefunds: true },
  });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');
  return { ...order, returnIndicators: indicatorsFromRecords(order) };
}

/** Shared whole-order guard: pending claims and completed refunds both count.
 *  Call under the order row lock shared with per-item return requests/receipt. */
async function hasPerItemReturn(tx: Prisma.TransactionClient, orderID: string): Promise<boolean> {
  const existing = await tx.return.findFirst({
    where: { orderID, status: { notIn: ['REJECTED', 'CANCELLED'] } },
    select: { id: true },
  });
  return existing !== null;
}

/** Restores only the quantity not already restocked by per-item returns.
 *  Callers hold the order row lock, shared with per-item return receipt.
 *  Stock movements record actual receipt; returnedQuantity also includes
 *  pending requests and must not be used as the already-restocked amount. */
async function restoreStock(
  tx: Prisma.TransactionClient,
  items: OrderItem[],
  orderNumber: string,
  verb: string
): Promise<void> {
  const priorRestocks = await tx.stockMovement.groupBy({
    by: ['orderItemID'],
    where: { orderItemID: { in: items.map((item) => item.id) }, type: 'RETURN' },
    _sum: { quantity: true },
  });
  const restockedByItem = new Map(priorRestocks.map((r) => [r.orderItemID, r._sum.quantity ?? 0]));
  for (const item of items) {
    const quantity = Math.max(0, item.quantity - (restockedByItem.get(item.id) ?? 0));
    if (quantity === 0) continue;
    await tx.productVariant.update({
      where: { id: item.variantID },
      data: { stockQuantity: { increment: quantity } },
    });
    await tx.stockMovement.create({
      data: {
        variantID: item.variantID,
        quantity,
        type: 'RETURN',
        orderID: item.orderID,
        orderItemID: item.id,
        reason: `Order ${orderNumber} ${verb}`,
      },
    });
  }
}

/**
 * The one place that actually cancels an order: restores stock and flips
 * status to CANCELLED, all in one transaction. Every caller — the customer's
 * own cancel button, a guest's token-based cancel, and the admin status
 * dropdown when the target status is CANCELLED — routes through this, so
 * there is exactly one cancellation implementation instead of several.
 *
 * `enforceCancellableGate` is what actually differs between them: a
 * customer/guest can only cancel PENDING/CONFIRMED orders (before SHIPPED);
 * an admin can force-cancel from any non-CANCELLED status (e.g. a
 * return-to-sender after shipping), so the admin path passes `false`.
 *
 * The status flip is an atomic conditional UPDATE (status predicate + write
 * in one statement) rather than a read-then-write — the same shape as
 * checkout()'s stock claim. Without this, a customer's cancel could read
 * PENDING, block on Postgres's row lock while an admin's concurrent "mark
 * SHIPPED" commits, then — once unblocked — write CANCELLED anyway using
 * that now-stale read, bypassing CANCELLABLE_STATUSES and restoring stock
 * for a unit that's already with the courier. The conditional UPDATE re-checks
 * the *current* status at the instant it actually writes, so that race now
 * fails closed (0 rows updated ⇒ reject) instead of succeeding silently.
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
    // RETURNED already restored this order's stock (see the RETURNED branch
    // of updateOrderStatus below) — cancelling it too would restore the same
    // units a second time.
    if (existing.status === 'RETURNED') {
      throw new AppError('CONFLICT', 'This order has already been returned and cannot be cancelled');
    }
    if (opts.enforceCancellableGate && !CANCELLABLE_STATUSES.includes(existing.status)) {
      throw new AppError('CONFLICT', 'This order can no longer be cancelled');
    }

    const claim = await tx.order.updateMany({
      where: {
        id,
        status: opts.enforceCancellableGate ? { in: CANCELLABLE_STATUSES } : { notIn: ['CANCELLED', 'RETURNED'] },
      },
      data: { status: 'CANCELLED' },
    });
    if (claim.count === 0) {
      throw new AppError('CONFLICT', 'This order can no longer be cancelled');
    }

    // The status claim holds the order row lock. Check return history while
    // holding it, even if an admin reverted the order to PENDING/CONFIRMED.
    // A customer cancellation cannot prove the remaining units came back.
    // Throwing rolls back the status claim as well as preventing any restock.
    if (opts.enforceCancellableGate && await hasPerItemReturn(tx, id)) {
      throw new AppError(
        'CONFLICT',
        'This order has a per-item return and cannot be cancelled. Please contact the store.'
      );
    }

    await restoreStock(tx, existing.items, existing.orderNumber, 'cancelled');

    const order = await tx.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
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
export async function getOrderByToken(rawToken: string) {
  const record = await findValidAccessToken(rawToken);
  if (!record) throw new AppError('NOT_FOUND', 'Order not found');
  return { ...record.order, returnIndicators: indicatorsFromRecords(record.order) };
}

/**
 * POST /api/orders/lookup — the manual fallback when a guest doesn't have
 * (or lost) their tracking link. `null` on any mismatch — wrong order
 * number, right order number but wrong contact, or no such order at all all
 * collapse to the exact same outcome here, so the caller can respond with
 * one generic message regardless (same enumeration-resistance principle as
 * password-reset / admin-login's uniform rejections). On a match, mints a
 * *fresh* OrderAccessToken rather than trying to recover whichever one was
 * emailed at confirmation — that hash is one-way, so there's nothing to
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

export async function listAllOrders(statuses?: OrderStatus[], flagged?: boolean, awaitingCod?: boolean, returnFilter?: OrderReturnFilter) {
  // awaitingCod implies its own status (DELIVERED) — takes precedence over an
  // explicit status list rather than combining into one `where.status` key
  // (an object-spread merge would just let one silently clobber the other).
  const where = Prisma.sql`${awaitingCod
    ? Prisma.sql`o."status" = 'DELIVERED' AND o."paymentMethod" = 'COD' AND o."paymentStatus" = 'PENDING'`
    : statuses?.length ? Prisma.sql`o."status"::text IN (${Prisma.join(statuses)})` : Prisma.sql`TRUE`}
    AND ${flagged ? Prisma.sql`o."flaggedForReview" = TRUE` : Prisma.sql`TRUE`}`;
  // Filter on the same SQL aggregates used for the badges. Query count stays
  // constant with the number of rows; never fetch returns once per order.
  const summaries = await readReturnIndicators(where, returnFilter);
  const orders = await prisma.order.findMany({
    where: { id: { in: [...summaries.keys()] } },
    orderBy: { dateCreated: 'desc' },
    include: { items: true, user: { select: { id: true, name: true, email: true, phone: true } } },
  });
  return orders.map(o => ({ ...o, returnIndicators: summaries.get(o.id)! }));
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

const NEXT_FULFILLMENT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: 'CONFIRMED', CONFIRMED: 'SHIPPED', SHIPPED: 'DELIVERED',
};

/** Corrections deliberately do not send lifecycle notifications or award
 * loyalty milestones. Record the reason atomically with stock/status changes. */
export async function correctOrderStatus(
  id: string,
  input: { status: OrderStatus; expectedStatus: OrderStatus; reason: string },
  actorID: string
) {
  const reason = input.reason.trim();
  if (!reason || reason.length > 1000) throw new AppError('VALIDATION_ERROR', 'A correction reason is required (up to 1000 characters)');
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "order" WHERE "id" = ${id}::uuid FOR UPDATE`;
    const existing = await tx.order.findUnique({ where: { id }, include: { items: true } });
    if (!existing) throw new AppError('NOT_FOUND', 'Order not found');
    if (existing.status !== input.expectedStatus) throw new AppError('CONFLICT', 'Order status changed. Reload before correcting it.');
    if (existing.status === input.status) throw new AppError('CONFLICT', 'Choose a different status for the correction');
    if (existing.status === 'CANCELLED' || existing.status === 'RETURNED') {
      throw new AppError('CONFLICT', 'Cancelled or returned orders cannot be reopened by a status correction');
    }
    if (await hasPerItemReturn(tx, id)) {
      throw new AppError('CONFLICT', 'This order has a per-item return. Resolve it through the Returns page instead of correcting its status.');
    }
    if (input.status === 'RETURNED') await createWholeOrderReturn(tx, id, existing.items, actorID, reason);
    if (input.status === 'CANCELLED' || input.status === 'RETURNED') {
      await restoreStock(tx, existing.items, existing.orderNumber, 'status correction');
    }
    const updated = await tx.order.update({
      where: { id }, data: { status: input.status },
      include: { items: true, returns: { include: { items: true } } },
    });
    await tx.auditLog.create({ data: {
      entityType: 'order', entityID: id, actorID, action: 'order.status_corrected',
      metadata: { orderNumber: existing.orderNumber, from: existing.status, to: input.status, reason },
    } });
    return updated;
  });
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

  // RETURNED needs the same stock-restoring treatment as CANCELLED — a
  // returned unit is back on the shelf, not still sold. Previously this fell
  // through to the plain status write below with no inventory side effect at
  // all (the RETURN StockMovement type existed but nothing ever wrote one for
  // this transition). Guarded the same way against a double-restore from
  // re-selecting RETURNED on an already-returned order.
  if (status === 'RETURNED') {
    const { order, previousStatus } = await prisma.$transaction(async (tx) => {
      // Serialize the guard with per-item return requests and receipt.
      await tx.$queryRaw`SELECT "id" FROM "order" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const existing = await tx.order.findUnique({ where: { id }, include: { items: true } });
      if (!existing) throw new AppError('NOT_FOUND', 'Order not found');
      if (existing.status === 'RETURNED') {
        throw new AppError('CONFLICT', 'This order has already been marked returned');
      }
      // CANCELLED already restored this order's stock — marking it RETURNED
      // too would restore the same units a second time.
      if (existing.status === 'CANCELLED') {
        throw new AppError('CONFLICT', 'This order was cancelled and cannot be marked returned');
      }
      // A whole-order receipt claims every line. Existing per-item returns
      // must continue through the Returns page to avoid overlapping claims
      // or restoring stock twice.
      // REFUNDED still represents stock restored at RECEIVED.
      if (await hasPerItemReturn(tx, id)) {
        throw new AppError(
          'CONFLICT',
          'This order has a per-item return — use the Returns page instead of marking the whole order returned.'
        );
      }

      const claim = await tx.order.updateMany({
        where: { id, status: { notIn: ['RETURNED', 'CANCELLED'] } },
        data: {
          status: 'RETURNED',
          ...(opts.estimatedDeliveryDays !== undefined
            ? { estimatedDeliveryDays: opts.estimatedDeliveryDays }
            : {}),
        },
      });
      if (claim.count === 0) {
        throw new AppError('CONFLICT', 'This order has already been marked returned or cancelled');
      }

      await createWholeOrderReturn(tx, id, existing.items, actorId);
      await restoreStock(tx, existing.items, existing.orderNumber, 'returned');

      const updated = await tx.order.findUniqueOrThrow({ where: { id }, include: { items: true, returns: { include: { items: true } } } });
      return { order: updated, previousStatus: existing.status };
    });
    await recordAudit({
      entityType: 'order',
      entityID: id,
      action: 'order.status_changed',
      actorID: actorId,
      metadata: {
        orderNumber: order.orderNumber,
        from: previousStatus,
        to: 'RETURNED',
        ...(opts.estimatedDeliveryDays !== undefined
          ? { estimatedDeliveryDays: opts.estimatedDeliveryDays }
          : {}),
      },
    });
    return order;
  }

  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) throw new AppError('NOT_FOUND', 'Order not found');

  // Atomic conditional write, same discipline as the CANCELLED/RETURNED
  // branches above: once an order has been cancelled or returned, its stock
  // has already been restored, so a concurrent "mark shipped" (or any other
  // plain status change) that read the order *before* that happened must not
  // be able to blindly stamp over it afterward — that would leave the order
  // looking SHIPPED (or whatever) while the unit it represents is already
  // back in inventory. This is the other half of the cancel-vs-ship race:
  // performCancellation() now guards its own write against a stale read of
  // *this* path; this guards this path's write against a stale read racing
  // performCancellation().
  if (existing.status !== status && NEXT_FULFILLMENT_STATUS[existing.status] !== status) {
    throw new AppError('CONFLICT', `Cannot move an order from ${existing.status} to ${status}. Advance one step or use a status correction.`);
  }
  const claim = await prisma.order.updateMany({
    where: { id, status: { equals: existing.status, notIn: ['CANCELLED', 'RETURNED'] } },
    data: {
      status,
      ...(opts.estimatedDeliveryDays !== undefined
        ? { estimatedDeliveryDays: opts.estimatedDeliveryDays }
        : {}),
    },
  });
  if (claim.count === 0) {
    throw new AppError('CONFLICT', 'Order status changed or is terminal. Reload before trying again.');
  }

  const updated = await prisma.order.findUniqueOrThrow({ where: { id }, include: { items: true, returns: { include: { items: true } } } });
  // A correction can move the order behind a milestone already announced.
  // Advancing through it again must not replay the confirmation/shipping email.
  const priorMilestone = (status === 'CONFIRMED' || status === 'SHIPPED')
    ? await prisma.auditLog.findFirst({
      where: { entityType: 'order', entityID: id, action: 'order.status_changed', metadata: { path: ['to'], equals: status } },
      select: { id: true },
    })
    : null;
  await recordAudit({
    entityType: 'order',
    entityID: id,
    action: 'order.status_changed',
    actorID: actorId,
    metadata: {
      orderNumber: existing.orderNumber,
      from: existing.status,
      to: status,
      ...(opts.estimatedDeliveryDays !== undefined
        ? { estimatedDeliveryDays: opts.estimatedDeliveryDays }
        : {}),
    },
  });

  // Email the customer the first time an order enters CONFIRMED (not on a
  // re-select of the same status) — this, not checkout, is when the
  // customer actually gets their order-confirmation email; see
  // sendOrderPlacedNotifications()'s doc comment. A guest order has no
  // access token yet (checkout no longer pre-mints one), so mint a fresh
  // one for the tracking link now, same as lookupOrder()'s "lost my link"
  // flow; a logged-in customer's own /orders/[id] needs no token.
  if (status === 'CONFIRMED' && existing.status !== 'CONFIRMED' && !priorMilestone) {
    void (async () => {
      const orderUrl = updated.userID ? accountOrderUrl(updated.id) : trackingUrl(await mintAccessToken(prisma, updated.id));
      await sendOrderConfirmedNotifications(updated, orderUrl);
    })().catch((err) => {
      console.error('[order.service] failed to send order-confirmed notification', err);
    });
  }

  // Email the customer the first time an order enters SHIPPED (not on a
  // re-select of the same status). Fire-and-forget, after commit, never
  // throws — same discipline as the order-placed / cancelled notifications.
  if (status === 'SHIPPED' && existing.status !== 'SHIPPED' && !priorMilestone) {
    void sendOrderShippedNotifications(updated).catch((err) => {
      console.error('[order.service] failed to send order-shipped notification', err);
    });
  }

  // Same fire-and-forget, first-time-only discipline as the SHIPPED email
  // above — checks every active loyalty rule against this customer's new
  // DELIVERED count/total and awards (generates + emails) any newly-crossed
  // milestone. Never throws; a broken loyalty rule must not fail the order
  // update that triggered it.
  if (status === 'DELIVERED' && existing.status !== 'DELIVERED') {
    void checkLoyaltyThreshold(updated).catch((err) => {
      console.error('[order.service] failed to check loyalty threshold', err);
    });
  }

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
    confirmedNotDelivered,
    lowStockVariants,
    outOfStockVariants,
    outOfStockItems,
    recentOrders,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: 'PENDING' } }),
    // Merchandise revenue — excludes the delivery fee (tracked separately).
    merchandiseSummary(Prisma.sql`o."status" IN ('DELIVERED', 'RETURNED')`),
    // Orders an anti-abuse velocity check flagged and no admin has cleared yet.
    prisma.order.count({ where: { flaggedForReview: true } }),
    // Delivered COD orders where the cash hasn't been marked collected.
    prisma.order.count({
      where: { paymentMethod: 'COD', paymentStatus: 'PENDING', status: 'DELIVERED' },
    }),
    // Accepted and (maybe) shipped, but not yet at the customer.
    prisma.order.count({ where: { status: { in: ['CONFIRMED', 'SHIPPED'] } } }),
    prisma.productVariant.count({
      where: { stockQuantity: { gt: 0, lte: LOW_STOCK_THRESHOLD }, product: { deletedAt: null } },
    }),
    prisma.productVariant.count({
      where: { stockQuantity: { lte: 0 }, product: { deletedAt: null } },
    }),
    // A bounded sample for the dashboard's own "Out of stock" list — the full
    // (up to 100) breakdown lives at /admin/analytics/inventory, which the
    // dashboard tile still links to; same take: 8 bound as recentOrders below.
    prisma.productVariant.findMany({
      where: { stockQuantity: { lte: 0 }, product: { deletedAt: null } },
      orderBy: { product: { nameEn: 'asc' } },
      take: 8,
      select: {
        sku: true,
        size: true,
        color: true,
        product: { select: { id: true, nameEn: true, nameAr: true } },
      },
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
    totalRevenue: deliveredRevenue.netOrderRevenue ?? 0,
    merchandise: deliveredRevenue,
    flaggedOrders,
    awaitingCodCollection,
    confirmedNotDelivered,
    lowStockVariants,
    outOfStockVariants,
    outOfStockItems: outOfStockItems.map((v) => ({
      productId: v.product.id,
      nameEn: v.product.nameEn,
      nameAr: v.product.nameAr,
      sku: v.sku,
      size: v.size,
      color: v.color,
    })),
    recentOrders,
  };
}
