import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { generateUniqueOrderNumber } from '../../lib/orderNumber';
import { recordAudit } from '../../lib/audit';
import {
  resolveDeliveryFee,
  toDeliveryConfig,
  type DeliveryConfig,
} from '../../lib/delivery-fee';
import { OrderStatus, Prisma } from '@prisma/client';

interface CheckoutOwner {
  userID?: string;
  sessionID?: string;
}

interface CheckoutInput {
  addressId?: string;
  guestEmail?: string;
  deliveryName: string;
  deliveryPhone: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryRegion: string;
  deliveryArea?: string;
  deliveryNotes?: string;
  notes?: string;
}

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

  return prisma.$transaction(async (tx) => {
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

    // Admin-configured delivery fee (flat, per-governorate override, or free
    // by threshold / free-region list — see lib/delivery-fee.ts).
    const cfg = await loadDeliveryConfig(tx);
    const { fee: deliveryFee } = resolveDeliveryFee(cfg, subtotal, input.deliveryRegion);
    const total = Math.round((subtotal + deliveryFee) * 100) / 100;

    const order = await tx.order.create({
      data: {
        orderNumber: await generateUniqueOrderNumber(tx),
        userID: owner.userID,
        addressID: input.addressId,
        guestEmail: input.guestEmail,
        deliveryName: input.deliveryName,
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

    return order;
  });
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

export async function listAllOrders(status?: OrderStatus) {
  return prisma.order.findMany({
    where: status ? { status } : {},
    orderBy: { dateCreated: 'desc' },
    include: { items: true, user: { select: { id: true, name: true, email: true, phone: true } } },
  });
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
