import { Prisma, type DiscountType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { round2, toNumber } from '../../lib/money';
import {
  pickDiscount,
  pricedWithDiscount,
  type AppliedDiscount,
  type DiscountCandidate,
} from '../../lib/pricing';
import { activeDiscounts, discountCoverage } from '../discounts/discount.service';
import { z } from 'zod';
import {
  listProductsQuerySchema,
  createProductSchema,
  updateProductSchema,
  createVariantSchema,
  updateVariantSchema,
  createProductImageSchema,
  updateProductImageSchema,
} from './product.schema';
import { cleanupCatalogImageIfOrphaned } from './image-cleanup.service';
import {
  archivedCategoryIds,
  productCategoryIds,
  productCollectionIds,
  productInCategoryFilter,
  productInCollectionFilter,
  productReachableFilter,
} from './category-tree';

type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
type CreateProductInput = z.infer<typeof createProductSchema>;
type UpdateProductInput = z.infer<typeof updateProductSchema>;
type CreateVariantInput = z.infer<typeof createVariantSchema>;
type UpdateVariantInput = z.infer<typeof updateVariantSchema>;
type CreateProductImageInput = z.infer<typeof createProductImageSchema>;
type UpdateProductImageInput = z.infer<typeof updateProductImageSchema>;

const productInclude = {
  images: { orderBy: { sortOrder: 'asc' as const } },
  variants: true,
  // Nested up to 4 levels of `parent` so the storefront can render a full
  // breadcrumb (Men → Shoes → Sport Shoes → ...) for the canonical category,
  // not just its own name — one of the stated reasons a primary category
  // exists (canonical URL/breadcrumbs). Fixed depth, not recursive: the
  // architecture doc's own UI guidance caps visible category depth around
  // 3-4 levels regardless of how deep the tree can structurally go.
  primaryCategory: { include: { parent: { include: { parent: { include: { parent: true } } } } } },
  categoryLinks: {
    include: { category: { select: { id: true, nameEn: true, nameAr: true, slug: true } } },
  },
  collectionLinks: {
    include: { collection: { select: { id: true, nameEn: true, nameAr: true, slug: true } } },
  },
};

// Attach the post-sale price so every product/variant read carries what a
// shopper actually pays — the product's own sale AND the best-matching active
// catalog discount (see lib/pricing.ts).
type Priced = {
  price: Prisma.Decimal;
  saleType: DiscountType | null;
  saleValue: Prisma.Decimal | null;
  primaryCategoryID: string;
  categoryLinks?: { categoryID: string }[];
  collectionLinks?: { collectionID: string }[];
  variants?: { price: Prisma.Decimal | null }[];
};
function withPricing<T extends Priced>(p: T, discounts: DiscountCandidate[] = []) {
  const picked: AppliedDiscount | null = pickDiscount(
    {
      price: p.price,
      saleType: p.saleType,
      saleValue: p.saleValue,
      categoryIDs: productCategoryIds(p),
      collectionIDs: productCollectionIds(p),
    },
    discounts
  );
  // A variant with no price of its own falls back to the product's price;
  // the same discount applies on top of whichever base price is in play.
  const priceFor = (base: Prisma.Decimal | number) =>
    pricedWithDiscount(base, p.saleType, p.saleValue, picked);
  const onSaleFor = (base: Prisma.Decimal | number) => priceFor(base) < round2(toNumber(base));
  // `searchText` is a DB-generated haystack for search only — never part of the
  // API shape (it's just nameEn+nameAr normalized, already on the wire).
  const rest = { ...p } as T & { searchText?: string };
  delete rest.searchText;
  return {
    ...rest,
    effectivePrice: priceFor(p.price),
    onSale: onSaleFor(p.price),
    discount: picked ? { type: picked.type, value: picked.value, stacking: picked.stacking } : null,
    variants: p.variants?.map((v) => {
      const base = v.price ?? p.price;
      return { ...v, effectivePrice: priceFor(base), onSale: onSaleFor(base) };
    }),
  };
}

// Apparel synonyms so search works "by meaning" without an ML layer: when a
// token (or its singular stem) is a key here, the listed words match too.
// Deliberately small and clothing-specific; pairs are listed both directions.
const SEARCH_SYNONYMS: Record<string, string[]> = {
  tee: ['tshirt', 'shirt'],
  tshirt: ['tee', 'shirt'],
  shirt: ['tshirt', 'tee'],
  top: ['tshirt', 'blouse'],
  trouser: ['pants', 'trousers'],
  trousers: ['pants'],
  pants: ['trousers'],
  short: ['shorts'],
  jumper: ['sweater', 'pullover'],
  sweater: ['jumper', 'pullover'],
  pullover: ['sweater', 'jumper'],
  hoodie: ['hooded', 'sweatshirt'],
  sweatshirt: ['hoodie'],
  sneaker: ['shoe', 'trainer'],
  sneakers: ['shoes', 'trainers'],
  trainer: ['sneaker', 'shoe'],
  trainers: ['sneakers', 'shoes'],
  frock: ['dress'],
  gown: ['dress'],
  jean: ['denim'],
  jeans: ['denim'],
  denim: ['jeans'],
  cap: ['hat'],
  hat: ['cap'],
  coat: ['jacket'],
  jacket: ['coat'],
  kid: ['child', 'boy', 'girl'],
  kids: ['children', 'boys', 'girls'],
  // cross-language hits people actually type into an EN/AR store
  قميص: ['shirt', 'tshirt'],
  تيشيرت: ['tshirt', 'tee', 'shirt'],
  فستان: ['dress'],
  بنطلون: ['pants', 'trousers'],
  حذاء: ['shoes'],
  جاكيت: ['jacket', 'coat'],
};

// Naive English de-pluralization — enough to make "shirts" find "shirt" and
// "boxes" find "box" without pulling in a stemmer. Leaves short words and
// "…ss" (dress, glass) alone.
function singular(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.endsWith('es') && !w.endsWith('sses')) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

const NON_WORD = /[^\p{L}\p{N}]+/gu;

/**
 * Turn a raw search string into a Prisma filter over the generated `searchText`
 * column (see migration 20260909180000). Matching is lenient by design:
 *  - the whole phrase and a punctuation-stripped form are tried as substrings,
 *    so "t-shirt", "tshirt" and "t shirt" all land on the same products;
 *  - otherwise every word must appear (AND), each satisfied by the word itself,
 *    its singular stem, or an apparel synonym — so "tees" finds "T-Shirt".
 * Returns `null` when the string has nothing usable to match on.
 */
function buildSearchFilter(raw: string): Prisma.ProductWhereInput | null {
  const q = raw.trim().toLowerCase();
  if (!q) return null;

  const collapsed = q.replace(NON_WORD, ''); // "t-shirt" -> "tshirt"
  const tokens = q.split(NON_WORD).filter((t) => t.length >= 2);

  const like = (s: string): Prisma.ProductWhereInput => ({
    searchText: { contains: s, mode: 'insensitive' },
  });
  const formsFor = (tok: string): string[] => {
    const forms = new Set<string>([tok, singular(tok)]);
    for (const syn of SEARCH_SYNONYMS[tok] ?? SEARCH_SYNONYMS[singular(tok)] ?? []) forms.add(syn);
    return [...forms].filter((f) => f.length >= 2);
  };

  const or: Prisma.ProductWhereInput[] = [like(q)];
  if (collapsed && collapsed !== q) or.push(like(collapsed));
  if (collapsed) {
    const stem = singular(collapsed);
    if (stem !== collapsed) or.push(like(stem));
  }
  if (tokens.length) {
    or.push({ AND: tokens.map((tok) => ({ OR: formsFor(tok).map(like) })) });
  }

  return { OR: or };
}

// `active` = live products; `archived` = soft-deleted only; `all` = both.
// `includeInactive` is a deprecated alias for `all`. Non-active is admin-only
// (gated in listProductsHandler).
//
// Storefront default: the product's own active/undeleted state, AND at least
// one of its category placements (primary or additional) still reachable —
// archiving a category is the admin's real "hide everything under this"
// action (computed at read time via archivedCategoryIds(), which also
// carries the effect of an archived ANCESTOR category, not just the
// category's own flag — see category-tree.ts). Before Stage 1 this only
// checked a single required category (fix-list.md #8/#22, resolves 12.6);
// with a product now placed in several categories, one archived placement no
// longer hides a product that's still properly reachable through another.
async function productStatusWhere(query: ListProductsQuery): Promise<Prisma.ProductWhereInput> {
  const status = query.status ?? (query.includeInactive ? 'all' : 'active');
  if (status === 'archived') return { deletedAt: { not: null } };
  if (status === 'all') return {};
  const archivedIds = await archivedCategoryIds();
  return {
    isActive: true,
    deletedAt: null,
    ...productReachableFilter(archivedIds),
  };
}

export async function listProducts(query: ListProductsQuery) {
  // Several of these fragments carry their own top-level `OR` (reachability,
  // category placement, search) — combined as separate `AND` entries rather
  // than object-spread, since spreading multiple `{ OR: [...] }` fragments
  // into one object would have each later one silently clobber the previous
  // one's `OR` key instead of narrowing the results.
  const and: Prisma.ProductWhereInput[] = [await productStatusWhere(query)];
  if (query.collectionId) and.push(productInCollectionFilter(query.collectionId));
  if (query.categoryId) and.push(productInCategoryFilter(query.categoryId));
  const searchFilter = query.search ? buildSearchFilter(query.search) : null;
  if (searchFilter) and.push(searchFilter);
  if (query.minPrice || query.maxPrice) {
    and.push({
      price: {
        ...(query.minPrice ? { gte: query.minPrice } : {}),
        ...(query.maxPrice ? { lte: query.maxPrice } : {}),
      },
    });
  }
  if (query.size || query.color) {
    and.push({
      variants: {
        some: {
          ...(query.size ? { size: query.size } : {}),
          ...(query.color ? { color: query.color } : {}),
        },
      },
    });
  }

  // Load the discounts in force now — needed both for pricing every row and
  // (when `onSale=true`) to narrow the query to discounted products.
  const discounts = await activeDiscounts();
  if (query.onSale) {
    const cov = discountCoverage(discounts);
    if (!cov.all) {
      // A product is "on sale" if it has its own live sale, or one of its
      // category/collection placements is covered by an active catalog
      // discount.
      const onSaleOr: Prisma.ProductWhereInput[] = [
        { saleType: { not: null }, saleValue: { gt: 0 } },
      ];
      if (cov.categoryIds.length) onSaleOr.push(productInCategoryFilter(cov.categoryIds));
      if (cov.collectionIds.length) onSaleOr.push(productInCollectionFilter(cov.collectionIds));
      and.push({ OR: onSaleOr });
    }
    // cov.all ⇒ every product is discounted; no extra restriction needed.
  }

  const where: Prisma.ProductWhereInput = { AND: and };

  if (query.sort === 'best_selling') {
    return bestSellingPage(where, query, discounts);
  }

  // `id` as a secondary key (fix-list.md #19, resolves 11.6): the primary
  // key alone doesn't uniquely order rows — `price_asc`/`price_desc` tie
  // whenever two products share a price (27 tied price groups in the
  // current catalog), and even `dateCreated` could tie in principle
  // (millisecond timestamps, bulk-imported data, …). Without a tiebreaker,
  // Postgres doesn't guarantee the same row order across repeated paginated
  // queries for tied rows — a product can silently shift page, or be
  // skipped or repeated, between one page fetch and the next. `id` is
  // arbitrary but stable, which is all a tiebreaker needs to be.
  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    query.sort === 'price_asc'
      ? [{ price: 'asc' }, { id: 'asc' }]
      : query.sort === 'price_desc'
        ? [{ price: 'desc' }, { id: 'asc' }]
        : [{ dateCreated: 'desc' }, { id: 'asc' }];

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: productInclude,
    }),
    prisma.product.count({ where }),
  ]);

  return {
    items: items.map((p) => withPricing(p, discounts)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

// How far back "best sellers" looks, and how deep the ranking goes.
const BEST_SELLING_WINDOW_DAYS = 90;
const BEST_SELLING_MAX = 200;

/**
 * `sort=best_selling`: rank products by units sold in the last
 * BEST_SELLING_WINDOW_DAYS (cancelled / returned orders don't count), keep the
 * top BEST_SELLING_MAX, then page that list. With no qualifying sales it falls
 * back to `sort=newest` so the row is never empty on a fresh store.
 */
async function bestSellingPage(
  where: Prisma.ProductWhereInput,
  query: ListProductsQuery,
  discounts: Awaited<ReturnType<typeof activeDiscounts>>
) {
  const since = new Date(Date.now() - BEST_SELLING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const sold = await prisma.orderItem.groupBy({
    by: ['variantID'],
    where: { order: { dateCreated: { gte: since }, status: { notIn: ['CANCELLED', 'RETURNED'] } } },
    _sum: { quantity: true },
  });

  const variants = sold.length
    ? await prisma.productVariant.findMany({
        where: { id: { in: sold.map((s) => s.variantID) } },
        select: { id: true, productID: true },
      })
    : [];
  const productForVariant = new Map(variants.map((v) => [v.id, v.productID]));
  const units = new Map<string, number>();
  for (const s of sold) {
    const pid = productForVariant.get(s.variantID);
    if (pid) units.set(pid, (units.get(pid) ?? 0) + (s._sum.quantity ?? 0));
  }

  const ranked = [...units.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .slice(0, BEST_SELLING_MAX);

  if (ranked.length === 0) {
    // No qualifying sales — behave like `sort=newest` (inline, not a recursive
    // call, so the return type stays inferrable).
    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: [{ dateCreated: 'desc' }, { id: 'asc' }], // same tiebreaker as above
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: productInclude,
      }),
      prisma.product.count({ where }),
    ]);
    return {
      items: rows.map((p) => withPricing(p, discounts)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  const rank = new Map(ranked.map((id, i) => [id, i]));
  const rows = await prisma.product.findMany({
    where: { ...where, id: { in: ranked } },
    include: productInclude,
  });
  rows.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));

  const start = (query.page - 1) * query.pageSize;
  return {
    items: rows.slice(start, start + query.pageSize).map((p) => withPricing(p, discounts)),
    total: rows.length,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getProductById(id: string, includeInactive = false) {
  const [product, discounts] = await Promise.all([
    prisma.product.findFirst({
      where: { id, ...(includeInactive ? {} : { isActive: true, deletedAt: null }) },
      include: productInclude,
    }),
    activeDiscounts(),
  ]);
  if (!product) throw new AppError('NOT_FOUND', 'Product not found');
  return withPricing(product, discounts);
}

// ---- Admin-side writes ----

// Integrity rule carried forward from the category tree itself (see
// robust-ecommerce-catalog-architecture.md "Rules to enforce"): a product
// can't be newly placed in a category that is archived, OR effectively
// archived by descending from an archived ancestor — the tree-aware version
// of the same rule, computed via archivedCategoryIds() rather than a plain
// own-archivedAt check, so it holds at every depth, not just for a directly
// archived category.
async function assertCategoriesAssignable(categoryIds: string[]) {
  if (categoryIds.length === 0) return;
  const unique = [...new Set(categoryIds)];
  const found = await prisma.category.findMany({ where: { id: { in: unique } }, select: { id: true } });
  if (found.length !== unique.length) {
    throw new AppError('NOT_FOUND', 'One or more categories were not found');
  }
  const archived = await archivedCategoryIds();
  if (unique.some((id) => archived.has(id))) {
    throw new AppError(
      'CONFLICT',
      'Cannot assign a product to an archived category (or one under an archived ancestor)'
    );
  }
}

// Same principle, one level over: a product can't be newly, manually placed
// into an archived collection.
async function assertCollectionsAssignable(collectionIds: string[]) {
  if (collectionIds.length === 0) return;
  const unique = [...new Set(collectionIds)];
  const found = await prisma.collection.findMany({
    where: { id: { in: unique } },
    select: { id: true, archivedAt: true },
  });
  if (found.length !== unique.length) {
    throw new AppError('NOT_FOUND', 'One or more collections were not found');
  }
  if (found.some((c) => c.archivedAt)) {
    throw new AppError('CONFLICT', 'Cannot assign a product to an archived collection');
  }
}

export async function createProduct(input: CreateProductInput) {
  // categoryLinks holds only ADDITIONAL placements — the primary category is
  // never duplicated into it (see the ProductCategory doc comment).
  const additionalCategoryIds = input.additionalCategoryIds.filter((id) => id !== input.primaryCategoryId);
  await assertCategoriesAssignable([input.primaryCategoryId, ...additionalCategoryIds]);
  await assertCollectionsAssignable(input.collectionIds);
  assertNoDuplicateVariants(input.variants);
  assertValidSale(input.saleType, input.saleValue);
  try {
    const created = await prisma.product.create({
      data: {
        sku: input.sku,
        nameEn: input.nameEn,
        nameAr: input.nameAr,
        descriptionEn: input.descriptionEn,
        descriptionAr: input.descriptionAr,
        primaryCategoryID: input.primaryCategoryId,
        price: input.price,
        compareAtPrice: input.compareAtPrice,
        quantity: input.quantity,
        saleType: input.saleType ?? null,
        saleValue: input.saleValue ?? null,
        variants: {
          create: input.variants.map((v) => ({
            sku: v.sku,
            size: v.size ?? null,
            color: v.color ?? null,
            price: v.price ?? null,
            stockQuantity: v.stockQuantity,
          })),
        },
        ...(additionalCategoryIds.length
          ? { categoryLinks: { create: additionalCategoryIds.map((categoryID) => ({ categoryID })) } }
          : {}),
        ...(input.collectionIds.length
          ? { collectionLinks: { create: input.collectionIds.map((collectionID) => ({ collectionID })) } }
          : {}),
      },
      include: productInclude,
    });
    return withPricing(created);
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  const existing = await prisma.product.findUnique({
    where: { id },
    select: { saleType: true, saleValue: true, lastEdit: true, primaryCategoryID: true },
  });
  if (!existing) throw new AppError('NOT_FOUND', 'Product not found');

  // Validate the sale as it will be after this patch (input value or the
  // one already stored).
  const nextSaleType = input.saleType !== undefined ? (input.saleType ?? null) : existing.saleType;
  const nextSaleValue =
    input.saleValue !== undefined ? (input.saleValue ?? null) : existing.saleValue;
  assertValidSale(nextSaleType, nextSaleValue);

  // undefined ⇒ leave that placement set untouched; an array (including [])
  // ⇒ replace it wholesale — same "replace-all on save" convention already
  // used elsewhere in this codebase (SiteSettings' reviewImages/storeLocations).
  // categoryLinks holds only ADDITIONAL placements, so the (possibly newly
  // patched) primary category is filtered out of it either way.
  const nextPrimaryCategoryId = input.primaryCategoryId ?? existing.primaryCategoryID;
  const additionalCategoryIds = input.additionalCategoryIds?.filter(
    (categoryId) => categoryId !== nextPrimaryCategoryId
  );
  if (input.primaryCategoryId !== undefined || additionalCategoryIds !== undefined) {
    await assertCategoriesAssignable([
      ...(input.primaryCategoryId !== undefined ? [input.primaryCategoryId] : []),
      ...(additionalCategoryIds ?? []),
    ]);
  }
  if (input.collectionIds !== undefined) {
    await assertCollectionsAssignable(input.collectionIds);
  }

  const data: Prisma.ProductUpdateInput = {
    ...(input.sku !== undefined ? { sku: input.sku } : {}),
    ...(input.nameEn !== undefined ? { nameEn: input.nameEn } : {}),
    ...(input.nameAr !== undefined ? { nameAr: input.nameAr } : {}),
    ...(input.descriptionEn !== undefined ? { descriptionEn: input.descriptionEn } : {}),
    ...(input.descriptionAr !== undefined ? { descriptionAr: input.descriptionAr } : {}),
    ...(input.primaryCategoryId !== undefined ? { primaryCategoryID: input.primaryCategoryId } : {}),
    ...(input.price !== undefined ? { price: input.price } : {}),
    ...(input.compareAtPrice !== undefined ? { compareAtPrice: input.compareAtPrice } : {}),
    ...(input.quantity !== undefined ? { quantity: input.quantity } : {}),
    ...(input.saleType !== undefined ? { saleType: input.saleType ?? null } : {}),
    ...(input.saleValue !== undefined ? { saleValue: input.saleValue ?? null } : {}),
  };

  try {
    await prisma.$transaction(async (tx) => {
      if (input.expectedLastEdit !== undefined) {
        // Atomic conditional update — same shape as the stock/status claims
        // elsewhere in this codebase (order.service.ts): the row's current
        // `lastEdit` is re-checked at the instant of the write itself, not in
        // a separate earlier read, so a genuinely concurrent second edit
        // can't slip through between the check and the write. Kept as the
        // FIRST statement in the transaction so a lost-update conflict rolls
        // back the whole thing, including any category/collection relink
        // below.
        const claim = await tx.product.updateMany({
          where: { id, lastEdit: input.expectedLastEdit },
          data,
        });
        if (claim.count === 0) {
          throw new AppError(
            'CONFLICT',
            'This product was changed by someone else since you loaded it. Refresh and try again.'
          );
        }
      } else {
        await tx.product.update({ where: { id }, data });
      }

      if (additionalCategoryIds !== undefined || input.collectionIds !== undefined) {
        await tx.product.update({
          where: { id },
          data: {
            ...(additionalCategoryIds !== undefined
              ? {
                  categoryLinks: {
                    deleteMany: {},
                    create: additionalCategoryIds.map((categoryID) => ({ categoryID })),
                  },
                }
              : {}),
            ...(input.collectionIds !== undefined
              ? {
                  collectionLinks: {
                    deleteMany: {},
                    create: input.collectionIds.map((collectionID) => ({ collectionID })),
                  },
                }
              : {}),
          },
        });
      }
    });
    const updated = await prisma.product.findUniqueOrThrow({ where: { id }, include: productInclude });
    return withPricing(updated);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw mapPrismaError(e);
  }
}

export async function deleteProduct(id: string) {
  await ensureProductExists(id);
  // Archive (soft delete) — keeps history for past OrderItems intact, and is
  // restorable. The admin's primary "remove" action.
  await prisma.product.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
}

export async function restoreProduct(id: string) {
  const existing = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AppError('NOT_FOUND', 'Product not found');
  return prisma.product.update({
    where: { id },
    data: { isActive: true, deletedAt: null },
    include: productInclude,
  }).then(withPricing);
}

// Permanent, irreversible — only for an already-archived product with no
// order history to protect.
export async function hardDeleteProduct(id: string) {
  const existing = await prisma.product.findUnique({ where: { id }, select: { deletedAt: true } });
  if (!existing) throw new AppError('NOT_FOUND', 'Product not found');
  if (!existing.deletedAt) {
    throw new AppError('CONFLICT', 'Archive the product before deleting it permanently.');
  }
  const inOrder = await prisma.orderItem.count({ where: { variant: { productID: id } } });
  if (inOrder > 0) {
    throw new AppError('CONFLICT', 'Cannot delete a product that appears in past orders. Keep it archived.');
  }
  const images = await prisma.productImage.findMany({ where: { productID: id }, select: { fileId: true } });
  await prisma.product.delete({ where: { id } });
  await Promise.all(images.map((img) => cleanupCatalogImageIfOrphaned(img.fileId)));
}

// ---- Variants (sub-resource) ----

export async function addVariant(productId: string, input: CreateVariantInput) {
  await ensureProductExists(productId);
  const existing = await prisma.productVariant.findMany({ where: { productID: productId } });
  assertNoDuplicateVariants([...existing, input]);

  try {
    return await prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.create({
        data: {
          productID: productId,
          sku: input.sku,
          size: input.size ?? null,
          color: input.color ?? null,
          price: input.price ?? null,
          stockQuantity: input.stockQuantity,
        },
      });
      if (input.stockQuantity > 0) {
        await tx.stockMovement.create({
          data: {
            variantID: variant.id,
            quantity: input.stockQuantity,
            type: 'INITIAL',
            reason: 'Variant created',
          },
        });
      }
      return variant;
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function updateVariant(
  productId: string,
  variantId: string,
  input: UpdateVariantInput,
  actorId?: string
) {
  const variant = await getVariantOrThrow(productId, variantId);

  const siblings = await prisma.productVariant.findMany({
    where: { productID: productId, id: { not: variantId } },
  });
  assertNoDuplicateVariants([
    ...siblings,
    {
      size: input.size === undefined ? variant.size : input.size,
      color: input.color === undefined ? variant.color : input.color,
    },
  ]);

  const nextStock = input.stockQuantity;
  const delta = nextStock === undefined ? 0 : nextStock - variant.stockQuantity;

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.productVariant.update({
        where: { id: variantId },
        data: {
          ...(input.sku !== undefined ? { sku: input.sku } : {}),
          ...(input.size !== undefined ? { size: input.size } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.price !== undefined ? { price: input.price } : {}),
          ...(nextStock !== undefined ? { stockQuantity: nextStock } : {}),
        },
      });
      if (delta !== 0) {
        await tx.stockMovement.create({
          data: {
            variantID: variantId,
            quantity: delta,
            type: 'ADJUSTMENT',
            actorID: actorId,
            reason: 'Variant edit',
          },
        });
      }
      return updated;
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function deleteVariant(productId: string, variantId: string) {
  await getVariantOrThrow(productId, variantId);
  const inOrder = await prisma.orderItem.count({ where: { variantID: variantId } });
  if (inOrder > 0) {
    throw new AppError('CONFLICT', 'Cannot delete a variant that appears in past orders');
  }
  // Every product is created with ≥1 variant (createProductSchema requires
  // it) and cart/checkout are variant-keyed throughout — a product with zero
  // variants isn't "sold out", it's structurally unpurchasable, with no
  // existing UI message that explains why (see fix-list.md #17). Block the
  // deletion that would create that state instead of allowing it one delete
  // at a time with no warning.
  const variantCount = await prisma.productVariant.count({ where: { productID: productId } });
  if (variantCount <= 1) {
    throw new AppError('CONFLICT', "Cannot delete a product's last variant. Delete the product instead, or add another variant first.");
  }
  await prisma.productVariant.delete({ where: { id: variantId } });
}

export async function updateStock(variantId: string, stockQuantity: number, actorId?: string) {
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!variant) throw new AppError('NOT_FOUND', 'Variant not found');

  const delta = stockQuantity - variant.stockQuantity;
  return prisma.$transaction(async (tx) => {
    const updated = await tx.productVariant.update({ where: { id: variantId }, data: { stockQuantity } });
    if (delta !== 0) {
      await tx.stockMovement.create({
        data: {
          variantID: variantId,
          quantity: delta,
          type: 'ADJUSTMENT',
          actorID: actorId,
          reason: 'Manual stock update',
        },
      });
    }
    return updated;
  });
}

// ---- Images (sub-resource) ----

export async function addImage(productId: string, input: CreateProductImageInput) {
  await ensureProductExists(productId);
  return prisma.productImage.create({ data: { productID: productId, ...input } });
}

export async function updateImage(productId: string, imageId: string, input: UpdateProductImageInput) {
  await ensureImageExists(productId, imageId);
  return prisma.productImage.update({ where: { id: imageId }, data: input });
}

export async function deleteImage(productId: string, imageId: string) {
  const image = await ensureImageExists(productId, imageId);
  await prisma.productImage.delete({ where: { id: imageId } });
  await cleanupCatalogImageIfOrphaned(image.fileId);
}

// ---- helpers ----

async function ensureProductExists(id: string) {
  const exists = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError('NOT_FOUND', 'Product not found');
}

async function getVariantOrThrow(productId: string, variantId: string) {
  const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!variant || variant.productID !== productId) {
    throw new AppError('NOT_FOUND', 'Variant not found');
  }
  return variant;
}

async function ensureImageExists(productId: string, imageId: string) {
  const img = await prisma.productImage.findUnique({
    where: { id: imageId },
    select: { productID: true, fileId: true },
  });
  if (!img || img.productID !== productId) {
    throw new AppError('NOT_FOUND', 'Product image not found');
  }
  return img;
}

// saleType + saleValue go together, and a PERCENT sale is bounded 0–100.
function assertValidSale(
  saleType: DiscountType | null | undefined,
  saleValue: number | Prisma.Decimal | null | undefined
) {
  const hasType = saleType != null;
  const hasValue = saleValue != null;
  if (hasType !== hasValue) {
    throw new AppError('VALIDATION_ERROR', 'saleType and saleValue must be set together');
  }
  if (saleType === 'PERCENT') {
    const v = toNumber(saleValue as Prisma.Decimal | number);
    if (v < 0 || v > 100) {
      throw new AppError('VALIDATION_ERROR', 'A percentage sale must be between 0 and 100');
    }
  }
}

// The DB unique on (productID, size, color) was dropped because Postgres treats
// each NULL as distinct — so duplicate prevention lives here instead.
function assertNoDuplicateVariants(
  variants: { size?: string | null; color?: string | null }[]
) {
  const seen = new Set<string>();
  for (const v of variants) {
    const key = `${v.size ?? ''}::${v.color ?? ''}`;
    if (seen.has(key)) {
      throw new AppError('CONFLICT', 'Duplicate variant (same size and colour)');
    }
    seen.add(key);
  }
}

function mapPrismaError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') return new AppError('CONFLICT', 'A record with this SKU already exists');
    if (e.code === 'P2003' || e.code === 'P2025') {
      return new AppError('NOT_FOUND', 'Referenced record not found');
    }
  }
  return e as Error;
}
