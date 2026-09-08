import { Prisma, type DiscountType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { round2, toNumber } from '../../lib/money';
import { pickDiscount, pricedWithDiscount, type DiscountCandidate } from '../../lib/pricing';
import { activeDiscounts } from '../discounts/discount.service';

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
  categoryID: string;
  collectionID: string | null;
};

function withPricing<T extends Priced>(p: T, discounts: DiscountCandidate[]) {
  const picked = pickDiscount(p, discounts);
  const price = pricedWithDiscount(p.price, p.saleType, p.saleValue, picked);
  return {
    ...p,
    effectivePrice: price,
    onSale: price < round2(toNumber(p.price)),
    discount: picked ? { type: picked.type, value: picked.value, stacking: picked.stacking } : null,
  };
}

/** The user's wishlist, newest first, each row carrying its hydrated product.
 *  Soft-deleted products are filtered out so a product removed from the
 *  catalog after being hearted silently drops off the list. */
export async function listFavourites(userId: string) {
  const [rows, discounts] = await Promise.all([
    prisma.favorite.findMany({
      where: { userID: userId, product: { deletedAt: null } },
      orderBy: { dateCreated: 'desc' },
      include: { product: { include: productInclude } },
    }),
    activeDiscounts(),
  ]);
  return rows.map((r) => ({
    id: r.id,
    dateCreated: r.dateCreated,
    product: withPricing(r.product, discounts),
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

  const [row, discounts] = await Promise.all([
    prisma.favorite.upsert({
      where: { userID_productID: { userID: userId, productID: productId } },
      create: { userID: userId, productID: productId },
      update: {},
      include: { product: { include: productInclude } },
    }),
    activeDiscounts(),
  ]);
  return { id: row.id, dateCreated: row.dateCreated, product: withPricing(row.product, discounts) };
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
