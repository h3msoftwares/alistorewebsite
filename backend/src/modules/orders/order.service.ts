import { createHash } from 'crypto';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { generateUniqueOrderNumber } from '../../lib/orderNumber';
import { recordAudit } from '../../lib/audit';
import { sendOrderPlacedNotifications } from '../../lib/notifications/notification.service';
import { isBlacklisted } from '../blacklist/blacklist.service';
import {
  resolveDeliveryFee,
  toDeliveryConfig,
  type DeliveryConfig,
} from '../../lib/delivery-fee';
import { REGION_VALUES } from '../../lib/regions';
import { OrderStatus, Prisma } from '@prisma/client';

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

type DbClient = Prisma.TransactionClient | typeof prisma;

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
  const items = await db.cartItem.findMany({
    where: { cartID: cart.id },
    include: { variant: { include: { product: { select: { price: true } } } } },
  });
  return items.reduce((sum, i) => sum + Number(i.variant.product.price) * i.quantity, 0);
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

  const order = await prisma.$transaction(async (tx) => {
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
      ? await tx.user.findUnique({ where: { id: owner.userID }, select: { name: true, email: true, emailVerified: true } })
      : null;
    const deliveryName = account?.name ?? input.deliveryName;
    const contactEmail = account?.email ?? input.guestEmail ?? null;

    // Explicit, admin-maintained hard block — checked before any other work.
    // Distinct from the automatic order-velocity soft-flag below: this is a
    // deliberate admin decision, not a heuristic, so it refuses the order
    // outright rather than just flagging it.
    const blacklisted =
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

    for (const item of cartItems) {
      if (item.variant.stockQuantity < item.quantity) {
        const label = [item.variant.size, item.variant.color].filter(Boolean).join('/') || 'one size';
        throw new AppError('OUT_OF_STOCK', `Not enough stock for ${item.variant.product.nameEn} (${label})`);
      }
    }

    const subtotal = cartItems.reduce((sum, i) => sum + Number(i.variant.product.price) * i.quantity, 0);

    // Admin-configured delivery fee (flat, per-region override, or free by
    // threshold / free-region list — see lib/delivery-fee.ts).
    const cfg = await loadDeliveryConfig(tx);
    if (!knownRegions(cfg).has(input.deliveryRegion)) {
      throw new AppError('VALIDATION_ERROR', `Unknown delivery region: ${input.deliveryRegion}`);
    }
    const { fee: deliveryFee } = resolveDeliveryFee(cfg, subtotal, input.deliveryRegion);
    const total = Math.round((subtotal + deliveryFee) * 100) / 100;

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
        deliveryFee,
        total,
        paymentMethod: 'COD',
        items: {
          create: cartItems.map((i) => ({
            variantID: i.variantID,
            productName: i.variant.product.nameEn,
            productSKU: i.variant.product.sku,
            variantSKU: i.variant.sku,
            productImageUrl: i.variant.product.images[0]?.url ?? null,
            size: i.variant.size,
            color: i.variant.color,
            quantity: i.quantity,
            unitPrice: i.variant.product.price,
            lineTotal: Math.round(Number(i.variant.product.price) * i.quantity * 100) / 100,
          })),
        },
      },
      include: { items: true },
    });

    for (const item of cartItems) {
      await tx.productVariant.update({
        where: { id: item.variantID },
        data: { stockQuantity: { decrement: item.quantity } },
      });
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
  });

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
  void sendOrderPlacedNotifications(order).catch((err) => {
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

export async function cancelOrder(id: string, userID: string) {
  const order = await prisma.order.findFirst({ where: { id, userID }, include: { items: true } });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');
  if (order.status !== 'PENDING') {
    throw new AppError('CONFLICT', 'Only pending orders can be cancelled');
  }

  // Put the reserved stock back and record it on the ledger.
  return prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      await tx.productVariant.update({
        where: { id: item.variantID },
        data: { stockQuantity: { increment: item.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          variantID: item.variantID,
          quantity: item.quantity,
          type: 'RETURN',
          orderID: order.id,
          reason: `Order ${order.orderNumber} cancelled`,
        },
      });
    }
    return tx.order.update({ where: { id }, data: { status: 'CANCELLED' }, include: { items: true } });
  });
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

export async function updateOrderStatus(id: string, status: OrderStatus, actorId?: string) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');
  const updated = await prisma.order.update({ where: { id }, data: { status } });
  await recordAudit({
    entityType: 'order',
    entityID: id,
    action: 'order.status_changed',
    actorID: actorId,
    metadata: { orderNumber: order.orderNumber, from: order.status, to: status },
  });
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

export async function salesDashboard() {
  const [totalOrders, pendingOrders, deliveredRevenue] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: 'PENDING' } }),
    // Merchandise revenue — excludes the delivery fee (tracked separately).
    prisma.order.aggregate({ where: { status: 'DELIVERED' }, _sum: { subtotal: true } }),
  ]);
  return {
    totalOrders,
    pendingOrders,
    totalRevenue: Number(deliveredRevenue._sum.subtotal ?? 0),
  };
}
