import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { generateOrderNumber } from '../../lib/orderNumber';
import { OrderStatus } from '@prisma/client';

interface CheckoutOwner {
  userID?: string;
  sessionID?: string;
}

interface CheckoutInput {
  addressId?: string;
  guestName?: string;
  guestPhone?: string;
  guestEmail?: string;
  deliveryText: string;
  notes?: string;
}

/** Creates a COD order from whatever is currently in the cart, snapshotting
 *  product name/price onto each OrderItem, decrementing stock, and clearing
 *  the cart — all in one transaction so a half-finished checkout can't
 *  leave stock or the cart in a bad state. */
export async function checkout(owner: CheckoutOwner, input: CheckoutInput) {
  if (!owner.userID && (!input.guestName || !input.guestPhone)) {
    throw new AppError('VALIDATION_ERROR', 'Guest checkout requires a name and phone number');
  }

  return prisma.$transaction(async (tx) => {
    const cartItems = await tx.cartItem.findMany({
      where: owner.userID ? { userID: owner.userID } : { sessionID: owner.sessionID },
      include: { variant: { include: { product: true } } },
    });
    if (cartItems.length === 0) throw new AppError('VALIDATION_ERROR', 'Cart is empty');

    for (const item of cartItems) {
      if (item.variant.stockQuantity < item.quantity) {
        throw new AppError('OUT_OF_STOCK', `Not enough stock for ${item.variant.product.nameEn} (${item.variant.size}/${item.variant.color})`);
      }
    }

    const subtotal = cartItems.reduce((sum, i) => sum + Number(i.variant.product.price) * i.quantity, 0);
    const total = Math.round(subtotal * 100) / 100; // no shipping-fee calculation — delivery is handled by the owner outside the app

    const order = await tx.order.create({
      data: {
        orderNumber: generateOrderNumber(),
        userID: owner.userID,
        addressID: input.addressId,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        guestEmail: input.guestEmail,
        deliveryText: input.deliveryText,
        notes: input.notes,
        subtotal,
        total,
        paymentMethod: 'COD',
        items: {
          create: cartItems.map((i) => ({
            variantID: i.variantID,
            productName: i.variant.product.nameEn,
            size: i.variant.size,
            color: i.variant.color,
            quantity: i.quantity,
            unitPrice: i.variant.product.price,
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
    }

    await tx.cartItem.deleteMany({
      where: owner.userID ? { userID: owner.userID } : { sessionID: owner.sessionID },
    });

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
  const order = await prisma.order.findFirst({ where: { id, userID } });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');
  if (order.status !== 'PENDING') {
    throw new AppError('CONFLICT', 'Only pending orders can be cancelled');
  }
  return prisma.order.update({ where: { id }, data: { status: 'CANCELLED' } });
}

// ---- Admin ----

export async function listAllOrders(status?: OrderStatus) {
  return prisma.order.findMany({
    where: status ? { status } : {},
    orderBy: { dateCreated: 'desc' },
    include: { items: true, user: true },
  });
}

export async function updateOrderStatus(id: string, status: OrderStatus) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');
  return prisma.order.update({ where: { id }, data: { status } });
}

export async function markCodCollected(id: string, collected: boolean) {
  const order = await prisma.order.findUnique({ where: { id } });
  if (!order) throw new AppError('NOT_FOUND', 'Order not found');
  return prisma.order.update({
    where: { id },
    data: { paymentStatus: collected ? 'COLLECTED' : 'PENDING' },
  });
}

export async function salesDashboard() {
  const [totalOrders, pendingOrders, deliveredRevenue] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { status: 'PENDING' } }),
    prisma.order.aggregate({ where: { status: 'DELIVERED' }, _sum: { total: true } }),
  ]);
  return {
    totalOrders,
    pendingOrders,
    totalRevenue: Number(deliveredRevenue._sum.total ?? 0),
  };
}
