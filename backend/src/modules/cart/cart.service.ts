import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';

interface CartOwner {
  userID?: string;
  sessionID?: string;
}

function ownerWhere(owner: CartOwner) {
  if (owner.userID) return { userID: owner.userID };
  if (owner.sessionID) return { sessionID: owner.sessionID };
  throw new AppError('VALIDATION_ERROR', 'No cart owner (user or guest session) provided');
}

export async function getCart(owner: CartOwner) {
  const items = await prisma.cartItem.findMany({
    where: ownerWhere(owner),
    include: { variant: { include: { product: { include: { images: true } } } } },
    orderBy: { dateCreated: 'asc' },
  });

  const subtotal = items.reduce((sum, i) => sum + Number(i.variant.product.price) * i.quantity, 0);
  return { items, subtotal: Math.round(subtotal * 100) / 100 };
}

export async function addItem(owner: CartOwner, variantId: string, quantity: number) {
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) throw new AppError('NOT_FOUND', 'Product variant not found');
  if (variant.stockQuantity < quantity) throw new AppError('OUT_OF_STOCK', 'Not enough stock for this variant');

  const existing = await prisma.cartItem.findFirst({ where: { ...ownerWhere(owner), variantID: variantId } });
  if (existing) {
    return prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + quantity } });
  }
  return prisma.cartItem.create({
    data: { ...owner, variantID: variantId, quantity },
  });
}

export async function updateItemQuantity(owner: CartOwner, itemId: string, quantity: number) {
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, ...ownerWhere(owner) } });
  if (!item) throw new AppError('NOT_FOUND', 'Cart item not found');
  return prisma.cartItem.update({ where: { id: itemId }, data: { quantity } });
}

export async function removeItem(owner: CartOwner, itemId: string) {
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, ...ownerWhere(owner) } });
  if (!item) throw new AppError('NOT_FOUND', 'Cart item not found');
  await prisma.cartItem.delete({ where: { id: itemId } });
}

/** Called right after login/register so a guest's cart isn't lost. */
export async function mergeGuestCartIntoUser(sessionID: string, userID: string) {
  const guestItems = await prisma.cartItem.findMany({ where: { sessionID } });
  for (const item of guestItems) {
    const existing = await prisma.cartItem.findFirst({ where: { userID, variantID: item.variantID } });
    if (existing) {
      await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + item.quantity } });
      await prisma.cartItem.delete({ where: { id: item.id } });
    } else {
      await prisma.cartItem.update({ where: { id: item.id }, data: { userID, sessionID: null } });
    }
  }
}
