import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { round2, toNumber } from '../../lib/money';
import type { CreateCouponInput, UpdateCouponInput } from './coupon.schema';

// Shared client or an interactive-transaction client — see blacklist.service.ts.
type Db = typeof prisma | Prisma.TransactionClient;

// ---- Admin CRUD ----

export function listCoupons() {
  return prisma.coupon.findMany({ orderBy: { dateCreated: 'desc' } });
}

function validateShape(input: { type?: 'PERCENT' | 'AMOUNT'; value?: number; startsAt?: string | null; endsAt?: string | null }) {
  if (input.type === 'PERCENT' && input.value != null && (input.value <= 0 || input.value > 100)) {
    throw new AppError('VALIDATION_ERROR', 'A percentage coupon must be between 0 and 100');
  }
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
    throw new AppError('VALIDATION_ERROR', 'endsAt must be after startsAt');
  }
}

export async function createCoupon(input: CreateCouponInput) {
  validateShape(input);
  try {
    return await prisma.coupon.create({
      data: {
        code: input.code.toUpperCase(),
        type: input.type,
        value: input.value,
        isActive: input.isActive,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        maxRedemptions: input.maxRedemptions ?? null,
        // Only override the DB default (1 = single-use per customer) when the
        // admin actually sent a value — `null` here means "explicitly
        // unlimited", not "not specified".
        ...(input.maxPerCustomer !== undefined ? { maxPerCustomer: input.maxPerCustomer ?? null } : {}),
      },
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function updateCoupon(id: string, input: UpdateCouponInput) {
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) throw new AppError('NOT_FOUND', 'Coupon not found');
  validateShape({
    type: input.type ?? existing.type,
    value: input.value ?? toNumber(existing.value),
    startsAt: input.startsAt !== undefined ? input.startsAt : existing.startsAt?.toISOString() ?? null,
    endsAt: input.endsAt !== undefined ? input.endsAt : existing.endsAt?.toISOString() ?? null,
  });
  try {
    return await prisma.coupon.update({
      where: { id },
      data: {
        ...(input.code !== undefined ? { code: input.code.toUpperCase() } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.value !== undefined ? { value: input.value } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.startsAt !== undefined ? { startsAt: input.startsAt ? new Date(input.startsAt) : null } : {}),
        ...(input.endsAt !== undefined ? { endsAt: input.endsAt ? new Date(input.endsAt) : null } : {}),
        ...(input.maxRedemptions !== undefined ? { maxRedemptions: input.maxRedemptions ?? null } : {}),
        ...(input.maxPerCustomer !== undefined ? { maxPerCustomer: input.maxPerCustomer ?? null } : {}),
      },
    });
  } catch (e) {
    throw mapPrismaError(e);
  }
}

export async function deleteCoupon(id: string) {
  const existing = await prisma.coupon.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AppError('NOT_FOUND', 'Coupon not found');
  await prisma.coupon.delete({ where: { id } });
}

// ---- Read-side: resolve a code to an applicable discount ----

export interface ResolvedCoupon {
  id: string;
  code: string;
  type: 'PERCENT' | 'AMOUNT';
  value: number;
  /** null = unlimited. checkout enforces both (see order.service.ts). */
  maxRedemptions: number | null;
  maxPerCustomer: number | null;
}

/** Looks up an active, in-window coupon by code (case-insensitive). Returns
 *  null when the code is unknown, disabled, outside its date window, or has
 *  already hit its global redemption cap. Per-customer caps need the caller's
 *  identity and are enforced at checkout.
 *
 *  `db` defaults to the plain client for the discount-preview controller;
 *  checkout() passes its `tx` explicitly (fix-list.md #11, resolves 1.8) —
 *  same extra-pool-pressure fix as activeDiscounts()/isBlacklisted(). */
export async function resolveCoupon(rawCode: string, at: Date = new Date(), db: Db = prisma): Promise<ResolvedCoupon | null> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return null;
  const c = await db.coupon.findUnique({ where: { code } });
  if (!c || !c.isActive) return null;
  if (c.startsAt && c.startsAt > at) return null;
  if (c.endsAt && c.endsAt < at) return null;
  if (c.maxRedemptions != null && c.timesRedeemed >= c.maxRedemptions) return null;
  return {
    id: c.id,
    code: c.code,
    type: c.type,
    value: toNumber(c.value),
    maxRedemptions: c.maxRedemptions,
    maxPerCustomer: c.maxPerCustomer,
  };
}

/** The currency amount a resolved coupon takes off `subtotal` (never more
 *  than the subtotal itself). */
export function couponAmountOff(coupon: ResolvedCoupon, subtotal: number): number {
  const off = coupon.type === 'PERCENT' ? (subtotal * coupon.value) / 100 : coupon.value;
  return round2(Math.min(Math.max(0, off), round2(subtotal)));
}

function mapPrismaError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    return new AppError('CONFLICT', 'A coupon with this code already exists');
  }
  return e as Error;
}
