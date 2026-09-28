import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { recordAudit } from '../../lib/audit';
import { bundlePriceBounds, type BundleCandidate } from '../../lib/bundle-pricing';
import { lineUnitPrice } from '../../lib/line-pricing';
import { PROMOTION_PRODUCT_INCLUDE } from '../catalog/category-tree';
import { activePromotions } from '../discounts/promotion.service';
import type { CreateBundleInput, UpdateBundleInput } from './bundle.schema';

type Db = Prisma.TransactionClient | typeof prisma;
const include = { components: { include: { variant: { include: { product: { select: { id: true, nameEn: true, nameAr: true, price: true, isActive: true, deletedAt: true } } } } }, orderBy: { variantID: 'asc' as const } } };

export function listBundles() { return prisma.bundle.findMany({ where: { deletedAt: null }, include, orderBy: { dateCreated: 'desc' } }); }
export async function getBundle(id: string) {
  const bundle = await prisma.bundle.findFirst({ where: { id, deletedAt: null }, include });
  if (!bundle) throw new AppError('NOT_FOUND', 'Bundle not found');
  return bundle;
}

async function validateRecipe(db: Db, data: CreateBundleInput, excludeID?: string) {
  const start = data.startsAt ? new Date(data.startsAt) : null;
  const end = data.endsAt ? new Date(data.endsAt) : null;
  if (start && end && end <= start) throw new AppError('VALIDATION_ERROR', 'Bundle end must be after its start');
  const variants = await db.productVariant.findMany({ where: { id: { in: data.components.map((c) => c.variantID) } }, include: { product: { include: PROMOTION_PRODUCT_INCLUDE } } });
  if (variants.length !== data.components.length || variants.some((v) => !v.product.isActive || v.product.deletedAt)) {
    throw new AppError('VALIDATION_ERROR', 'Select at least two distinct, active product SKUs');
  }
  const promotions = await activePromotions(undefined, db);
  const priceCents = Math.round(data.price * 100);
  // Check both regular and effective prices; temporary promotions cannot
  // conceal a recipe whose total drops when the missing unit is added.
  for (const effective of [false, true]) {
    const parts = data.components.map((c) => {
      const variant = variants.find((v) => v.id === c.variantID)!;
      return { quantity: c.quantity, individualPriceCents: Math.round((effective ? lineUnitPrice(variant, promotions) : Number(variant.price ?? variant.product.price)) * 100) };
    });
    const bounds = bundlePriceBounds(parts);
    if (priceCents <= bounds.incompleteCents || priceCents >= bounds.fullCents) {
      throw new AppError('VALIDATION_ERROR', `Bundle price must be above $${(bounds.incompleteCents / 100).toFixed(2)} and below $${(bounds.fullCents / 100).toFixed(2)} (${effective ? 'current sale/promotion' : 'regular'} prices).`, { ...bounds, priceCents });
    }
  }
  if (data.status === 'ACTIVE') {
    const conflicts = await db.bundle.findMany({ where: {
      id: excludeID ? { not: excludeID } : undefined, deletedAt: null, status: 'ACTIVE',
      components: { some: { variantID: { in: data.components.map((c) => c.variantID) } } },
      AND: [
        ...(end ? [{ OR: [{ startsAt: null }, { startsAt: { lt: end } }] }] : []),
        ...(start ? [{ OR: [{ endsAt: null }, { endsAt: { gt: start } }] }] : []),
      ],
    }, select: { id: true, nameEn: true } });
    if (conflicts.length) throw new AppError('CONFLICT', 'An active Bundle already uses a selected SKU during this scheduled window', { reason: 'BUNDLE_OVERLAP', conflicts });
  }
}

export async function createBundle(data: CreateBundleInput, actorID: string) {
  const bundle = await prisma.$transaction(async (tx) => {
    // Serializes overlap validation with activation/edit/archive, including
    // two different recipes created concurrently for the same SKU.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(78349102)`;
    await validateRecipe(tx, data);
    const { components, startsAt, endsAt, ...fields } = data;
    return tx.bundle.create({ data: { ...fields, startsAt: startsAt ? new Date(startsAt) : null, endsAt: endsAt ? new Date(endsAt) : null, components: { create: components } }, include });
  });
  await recordAudit({ entityType: 'bundle', entityID: bundle.id, action: 'bundle.created', actorID, metadata: { nameEn: bundle.nameEn, price: data.price, components: data.components } });
  return bundle;
}

export async function updateBundle(id: string, patch: UpdateBundleInput, actorID: string) {
  const bundle = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(78349102)`;
    const existing = await tx.bundle.findFirst({ where: { id, deletedAt: null }, include: { components: true } });
    if (!existing) throw new AppError('NOT_FOUND', 'Bundle not found');
    const merged: CreateBundleInput = { nameEn: existing.nameEn, nameAr: existing.nameAr, price: Number(existing.price), status: existing.status,
      startsAt: existing.startsAt?.toISOString() ?? null, endsAt: existing.endsAt?.toISOString() ?? null,
      components: existing.components.map(({ variantID, quantity }) => ({ variantID, quantity })), ...patch };
    await validateRecipe(tx, merged, id);
    const { components, startsAt, endsAt, ...fields } = merged;
    return tx.bundle.update({ where: { id }, data: { ...fields, startsAt: startsAt ? new Date(startsAt) : null, endsAt: endsAt ? new Date(endsAt) : null, components: { deleteMany: {}, create: components } }, include });
  });
  await recordAudit({ entityType: 'bundle', entityID: id, action: 'bundle.updated', actorID, metadata: patch });
  return bundle;
}

export async function deleteBundle(id: string, actorID: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(78349102)`;
    const changed = await tx.bundle.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: new Date(), status: 'ENDED' } });
    if (!changed.count) throw new AppError('NOT_FOUND', 'Bundle not found');
    // Purchase components are separate immutable rows. Retire the live recipe
    // so an archived, unpurchased definition does not pin SKUs forever.
    await tx.bundleComponent.deleteMany({ where: { bundleID: id } });
  });
  await recordAudit({ entityType: 'bundle', entityID: id, action: 'bundle.archived', actorID });
}

export async function activeBundles(at: Date = new Date(), db: Db = prisma): Promise<BundleCandidate[]> {
  const rows = await db.bundle.findMany({ where: { status: 'ACTIVE', deletedAt: null,
    AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: at } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: at } }] }],
    components: { every: { variant: { product: { isActive: true, deletedAt: null } } } },
  }, include: { components: true } });
  return rows.map((row) => ({ id: row.id, nameEn: row.nameEn, nameAr: row.nameAr, priceCents: Math.round(Number(row.price) * 100), components: row.components.map(({ variantID, quantity }) => ({ variantID, quantity })) }));
}
