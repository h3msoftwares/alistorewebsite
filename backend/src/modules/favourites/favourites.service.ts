import { Prisma, type DiscountType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { effectivePrice, isOnSale } from '../../lib/pricing';

// Same hydrated product shape the catalog endpoints return (mirrors
// `productInclude` / `withPricing` in catalog/product.service.ts) so the
// favourites page can hand each `product` straight to <ProductCard> without a
// second round-trip. Replicated here rather than imported to keep this module
// self-contained and off the catalog files.
const productInclude = {
  images: { orderBy: { sortOrder: 'asc' as const } },
  variants: true,
  category: true,
  collection: { select: { id: true, nameEn: true, nameAr: true, slug: true } },
} satisfies Prisma.ProductInclude;

type Priced = {
  price: Prisma.Decimal;
  saleType: DiscountType | null;
  saleValue: Prisma.Decimal | null;
};

function withPricing<T extends Priced>(p: T) {
  return {
    ...p,
    effectivePrice: effectivePrice(p.price, p.saleType, p.saleValue),
    onSale: isOnSale(p.price, p.saleType, p.saleValue),
  };
}

/** The user's wishlist, newest first, each row carrying its hydrated product.
 *  Soft-deleted products are filtered out so a product removed from the
 *  catalog after being hearted silently drops off the list. */
export async function listFavourites(userId: string) {
  const rows = await prisma.favorite.findMany({
    where: { userID: userId, product: { deletedAt: null } },
    orderBy: { dateCreated: 'desc' },
    include: { product: { include: productInclude } },
  });
  return rows.map((r) => ({
    id: r.id,
    dateCreated: r.dateCreated,
    product: withPricing(r.product),
  }));
}

/** Heart a product. Idempotent: the composite unique on (userID, productID)
 *  makes a repeat call a no-op, so this resolves the same whether the row
 *  already existed or not. Rejects an unknown or soft-deleted product. */
export async function addFavourite(userId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true },
  });
  if (!product) throw new AppError('NOT_FOUND', 'Product not found');

  const row = await prisma.favorite.upsert({
    where: { userID_productID: { userID: userId, productID: productId } },
    create: { userID: userId, productID: productId },
    update: {},
    include: { product: { include: productInclude } },
  });
  return { id: row.id, dateCreated: row.dateCreated, product: withPricing(row.product) };
}

/** Un-heart a product. 404s when it wasn't favourited — same as
 *  /api/addresses deleting a row that isn't there. */
export async function removeFavourite(userId: string, productId: string) {
  const existing = await prisma.favorite.findUnique({
    where: { userID_productID: { userID: userId, productID: productId } },
  });
  if (!existing) throw new AppError('NOT_FOUND', 'Favourite not found');
  await prisma.favorite.delete({ where: { id: existing.id } });
}
