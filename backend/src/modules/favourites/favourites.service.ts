import { Prisma, type DiscountType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { round2, toNumber } from '../../lib/money';
import { pickPromotion, pricedWithPromotion, type PromotionCandidate } from '../../lib/pricing';
import { productCategoryPaths, productCollectionIds } from '../catalog/category-tree';
import { activePromotions } from '../discounts/promotion.service';

// Same hydrated product shape the catalog endpoints return (mirrors
// `productInclude` / `withPricing` in catalog/product.service.ts) so the
// favourites page can hand each `product` straight to <ProductCard> without a
// second round-trip. Replicated here rather than imported to keep this module
// self-contained and off the catalog files. `primaryCategory: true` already
// carries `path` (a full include returns every scalar); `categoryLinks`
// nests `category.path` explicitly since its own select is otherwise narrow.
const productInclude = {
  images: { orderBy: { sortOrder: 'asc' as const } },
  variants: true,
  primaryCategory: true,
  categoryLinks: { select: { category: { select: { path: true } } } },
  collectionLinks: { select: { collectionID: true } },
} satisfies Prisma.ProductInclude;

type Priced = {
  id: string;
  price: Prisma.Decimal;
  saleType: DiscountType | null;
  saleValue: Prisma.Decimal | null;
  primaryCategory?: { path: string } | null;
  categoryLinks?: { category: { path: string } }[];
  collectionLinks?: { collectionID: string }[];
};

function withPricing<T extends Priced>(p: T, promotions: PromotionCandidate[]) {
  const picked = pickPromotion(
    {
      id: p.id,
      price: p.price,
      saleType: p.saleType,
      saleValue: p.saleValue,
      categoryPaths: productCategoryPaths(p),
      collectionIds: productCollectionIds(p),
    },
    promotions
  );
  const price = pricedWithPromotion(p.price, p.saleType, p.saleValue, picked);
  return {
    ...p,
    effectivePrice: price,
    onSale: price < round2(toNumber(p.price)),
    promotion: picked ? { type: picked.type, value: picked.value, stackable: picked.stackable } : null,
  };
}

/** The user's wishlist, newest first, each row carrying its hydrated product.
 *  Soft-deleted products are filtered out so a product removed from the
 *  catalog after being hearted silently drops off the list. */
export async function listFavourites(userId: string) {
  const [rows, promotions] = await Promise.all([
    prisma.favorite.findMany({
      where: { userID: userId, product: { deletedAt: null } },
      orderBy: { dateCreated: 'desc' },
      include: { product: { include: productInclude } },
    }),
    activePromotions(),
  ]);
  return rows.map((r) => ({
    id: r.id,
    dateCreated: r.dateCreated,
    product: withPricing(r.product, promotions),
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

  const [row, promotions] = await Promise.all([
    prisma.favorite.upsert({
      where: { userID_productID: { userID: userId, productID: productId } },
      create: { userID: userId, productID: productId },
      update: {},
      include: { product: { include: productInclude } },
    }),
    activePromotions(),
  ]);
  return { id: row.id, dateCreated: row.dateCreated, product: withPricing(row.product, promotions) };
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
