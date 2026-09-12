import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { round2 } from '../../lib/money';
import { lineUnitPrice } from '../../lib/line-pricing';
import { activeDiscounts } from '../discounts/discount.service';

interface CartOwner {
  userID?: string;
  sessionID?: string;
}

// Resolve the single Cart row for this owner, creating it on first use.
// `userID` and `sessionID` are both unique on Cart.
//
// Found alongside fix-list.md #18 while verifying it, same read-then-create
// race one level up: a brand-new owner's first-ever concurrent add-to-cart
// calls (e.g. two tabs opened at once) used to both read "no cart exists
// yet", both attempt `cart.create()`, and the unique constraint on
// `userID`/`sessionID` would reject the second — uncaught, same raw-500
// shape as the CartItem race #18 fixes below.
//
// `prisma.cart.upsert()` was tried first and, empirically, is NOT safe here
// under genuine concurrent execution — live-tested and it still threw the
// same `P2002` on `userID` under a real concurrent race (Prisma's upsert
// doesn't always compile to a single atomic `INSERT ... ON CONFLICT` for
// every model shape). Catching the create's own conflict and recovering by
// re-reading the now-existing row (created by whichever request won) is the
// pattern that's actually verified safe: proven by the new concurrency test
// below, not just reasoned about.
async function getOrCreateCart(owner: CartOwner) {
  const where = owner.userID ? { userID: owner.userID } : owner.sessionID ? { sessionID: owner.sessionID } : null;
  if (!where) {
    throw new AppError('VALIDATION_ERROR', 'No cart owner (user or guest session) provided');
  }
  const existing = await prisma.cart.findUnique({ where });
  if (existing) return existing;
  try {
    return await prisma.cart.create({ data: where });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      // Lost the race to create — the winner's row exists now; use it.
      return prisma.cart.findUniqueOrThrow({ where });
    }
    throw e;
  }
}

export async function getCart(owner: CartOwner) {
  const cart = await getOrCreateCart(owner);
  const [rows, discounts] = await Promise.all([
    prisma.cartItem.findMany({
      where: { cartID: cart.id },
      // `variants: true` lets the cart page/drawer build a size/color picker
      // (sibling variants of the same product) without a second request per row.
      include: { variant: { include: { product: { include: { images: true, variants: true } } } } },
      orderBy: { dateCreated: 'asc' },
    }),
    activeDiscounts(),
  ]);

  // Attach the effective unit price (variant override → product sale → catalog
  // discount) so the cart UI and the total agree with what checkout will charge.
  const items = rows.map((i) => ({
    ...i,
    effectivePrice: lineUnitPrice(i.variant, discounts),
  }));
  const subtotal = round2(items.reduce((sum, i) => sum + i.effectivePrice * i.quantity, 0));
  return { items, subtotal };
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

  // Create-then-recover-on-conflict (fix-list.md #18, resolves 1.6) instead
  // of the plain update-or-create branch this replaced: two concurrent adds
  // of the same line used to both read `existing = null` (READ COMMITTED),
  // both take the `create` branch, and the DB's own unique constraint on
  // (cartID, variantID) correctly rejected the second one — but uncaught, so
  // it surfaced as a raw 500 instead of the two quantities merging.
  // `prisma.cartItem.upsert()` was tried first here too and rejected for the
  // same reason as `getOrCreateCart()` above (verified unsafe under real
  // concurrency, not just theorised) — catching the create's own conflict
  // and recovering with an atomic increment is what's actually proven safe.
  // The `existing`/stock check above is unchanged and still only a friendly
  // early signal (same "preliminary, non-authoritative" role as checkout()'s
  // own pre-checks — cart-level stock enforcement was never the
  // authoritative gate, checkout's atomic claim is).
  try {
    return await prisma.cartItem.create({ data: { cartID: cart.id, variantID: variantId, quantity } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      // Lost the race to create — merge into the winner's row instead.
      return prisma.cartItem.update({
        where: { cartID_variantID: { cartID: cart.id, variantID: variantId } },
        data: { quantity: { increment: quantity } },
      });
    }
    throw e;
  }
}

interface UpdateItemChanges {
  quantity?: number;
  /** Repoints the line at a different variant of the same (or any) product —
   *  a size/color change. Omit to change quantity only. */
  variantId?: string;
}

/** Updates a cart line's quantity and/or which variant it points at.
 *
 *  A variant change is not a simple field write: if another line in this
 *  cart already holds the target variant, the two lines are merged (same
 *  rule addItem uses for a duplicate add) and this line is deleted instead
 *  of leaving a second line for the same variant. Either way, stock is
 *  checked against the variant the line will end up on, not the one it
 *  started on. */
export async function updateItem(owner: CartOwner, itemId: string, changes: UpdateItemChanges) {
  const cart = await getOrCreateCart(owner);
  const item = await prisma.cartItem.findFirst({ where: { id: itemId, cartID: cart.id } });
  if (!item) throw new AppError('NOT_FOUND', 'Cart item not found');

  const targetVariantId = changes.variantId ?? item.variantID;
  const variant = await prisma.productVariant.findUnique({
    where: { id: targetVariantId },
    include: { product: { select: { deletedAt: true } } },
  });
  if (!variant || variant.product.deletedAt) {
    throw new AppError('NOT_FOUND', 'Product variant not found');
  }

  const changingVariant = changes.variantId !== undefined && changes.variantId !== item.variantID;
  const requestedQuantity = changes.quantity ?? item.quantity;

  if (!changingVariant) {
    if (variant.stockQuantity < requestedQuantity) {
      throw new AppError('OUT_OF_STOCK', 'Not enough stock for this variant');
    }
    return prisma.cartItem.update({ where: { id: itemId }, data: { quantity: requestedQuantity } });
  }

  // Repointing at a different variant — another line for it may already
  // exist (the shopper had both sizes in their cart, say). If so, merge into
  // that line and drop this one rather than leaving two lines for one variant.
  const collision = await prisma.cartItem.findFirst({
    where: { cartID: cart.id, variantID: targetVariantId, id: { not: itemId } },
  });

  if (collision) {
    const mergedQuantity = collision.quantity + requestedQuantity;
    if (variant.stockQuantity < mergedQuantity) {
      throw new AppError('OUT_OF_STOCK', 'Not enough stock for this variant');
    }
    const [merged] = await prisma.$transaction([
      prisma.cartItem.update({ where: { id: collision.id }, data: { quantity: mergedQuantity } }),
      prisma.cartItem.delete({ where: { id: itemId } }),
    ]);
    return merged;
  }

  if (variant.stockQuantity < requestedQuantity) {
    throw new AppError('OUT_OF_STOCK', 'Not enough stock for this variant');
  }
  return prisma.cartItem.update({
    where: { id: itemId },
    data: { variantID: targetVariantId, quantity: requestedQuantity },
  });
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
