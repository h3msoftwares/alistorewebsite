import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';

interface CartOwner {
  userID?: string;
  sessionID?: string;
}

// Resolve the single Cart row for this owner, creating it on first use.
// `userID` and `sessionID` are both unique on Cart.
async function getOrCreateCart(owner: CartOwner) {
  if (!owner.userID && !owner.sessionID) {
    throw new AppError('VALIDATION_ERROR', 'No cart owner (user or guest session) provided');
  }
  const where = owner.userID ? { userID: owner.userID } : { sessionID: owner.sessionID! };
  const existing = await prisma.cart.findUnique({ where });
  return existing ?? prisma.cart.create({ data: where });
}

export async function getCart(owner: CartOwner) {
  const cart = await getOrCreateCart(owner);
  const items = await prisma.cartItem.findMany({
    where: { cartID: cart.id },
    include: { variant: { include: { product: { include: { images: true } } } } },
    orderBy: { dateCreated: 'asc' },
  });

  const subtotal = items.reduce((sum, i) => sum + Number(i.variant.product.price) * i.quantity, 0);
  return { items, subtotal: Math.round(subtotal * 100) / 100 };
}

export async function addItem(owner: CartOwner, variantId: string, quantity: number) {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: { select: { deletedAt: true } } },
  });
  // A soft-deleted product is off the catalog — treat its variants as gone,
  // consistent with getProductById / the favourites endpoints.
  if (!variant || variant.product.deletedAt) {
    throw new AppError('NOT_FOUND', 'Product variant not found');
  }

  const cart = await getOrCreateCart(owner);
  const existing = await prisma.cartItem.findFirst({ where: { cartID: cart.id, variantID: variantId } });

  // Guard the resulting line quantity, not just the incoming delta — otherwise
  // repeated adds can walk a line past available stock.
  const nextQuantity = (existing?.quantity ?? 0) + quantity;
  if (variant.stockQuantity < nextQuantity) {
    throw new AppError('OUT_OF_STOCK', 'Not enough stock for this variant');
  }

  if (existing) {
    return prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQuantity } });
  }
  return prisma.cartItem.create({
    data: { cartID: cart.id, variantID: variantId, quantity },
  });
}

export async function updateItemQuantity(owner: CartOwner, itemId: string, quantity: number) {
  const cart = await getOrCreateCart(owner);
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartID: cart.id } });
  if (!item) throw new AppError('NOT_FOUND', 'Cart item not found');

  const variant = await prisma.productVariant.findUnique({ where: { id: item.variantID } });
  if (!variant) throw new AppError('NOT_FOUND', 'Product variant not found');
  if (variant.stockQuantity < quantity) {
    throw new AppError('OUT_OF_STOCK', 'Not enough stock for this variant');
  }

  return prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
}

export async function removeItem(owner: CartOwner, itemId: string) {
  const cart = await getOrCreateCart(owner);
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartID: cart.id } });
  if (!item) throw new AppError('NOT_FOUND', 'Cart item not found');
  await prisma.cartItem.delete({ where: { id: itemId } });
}

export async function clearCart(owner: CartOwner) {
  const cart = await getOrCreateCart(owner);
  await prisma.cartItem.deleteMany({ where: { cartID: cart.id } });
}

/** Called right after login/register so a guest's cart isn't lost. With the
 *  Cart model this is a single-row re-point in the common case (user has no
 *  cart yet), or an item-by-item merge into the existing user cart. */
export async function mergeGuestCartIntoUser(sessionID: string, userID: string) {
  const guestCart = await prisma.cart.findUnique({ where: { sessionID }, include: { items: true } });
  if (!guestCart) return;

  if (guestCart.items.length === 0) {
    await prisma.cart.delete({ where: { id: guestCart.id } });
    return;
  }

  const userCart = await prisma.cart.findUnique({ where: { userID } });
  if (!userCart) {
    // Hand the whole guest cart to the user.
    await prisma.cart.update({ where: { id: guestCart.id }, data: { userID, sessionID: null } });
    return;
  }

  for (const item of guestCart.items) {
    const existing = await prisma.cartItem.findFirst({
      where: { cartID: userCart.id, variantID: item.variantID },
    });
    if (existing) {
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + item.quantity },
      });
    } else {
      await prisma.cartItem.update({ where: { id: item.id }, data: { cartID: userCart.id } });
    }
  }
  await prisma.cart.delete({ where: { id: guestCart.id } });
}
