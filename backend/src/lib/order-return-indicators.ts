import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { moneyCents } from './return-pricing';

export type OrderReturnFilter = 'HAS_RETURN' | 'IN_PROGRESS' | 'REFUND_DUE' | 'AWAITING_REFUND_MARKING' | 'MARKED_REFUNDED' | 'AWAITING_APPROVAL' | 'IN_TRANSIT';

export interface ReturnIndicatorTotals {
  orderedUnits: number;
  originalMerchandiseCents: number;
  activeReturns: number;
  inProgressReturns: number;
  inProgressUnits: number;
  pendingRefundCents: number;
  physicallyReturnedUnits: number;
  awaitingMarkingReturns: number;
  awaitingMarkingCents: number;
  markedReturns: number;
  markedUnits: number;
  markedRefundCents: number;
  owedGoodwillCount?: number;
  owedGoodwillCents?: number;
}

/** Money and physical receipt are independent. A zero-dollar marking must
 * remain visible, but cannot label a positive-value order fully marked. */
export function deriveReturnIndicators(t: ReturnIndicatorTotals) {
  const returnStatus = t.physicallyReturnedUnits > 0
    ? (t.physicallyReturnedUnits >= t.orderedUnits ? 'FULLY_RETURNED' : 'PARTIALLY_RETURNED')
    : t.inProgressReturns > 0 ? 'IN_PROGRESS' : 'NONE';
  const fullyMarked = t.markedReturns > 0 && (t.originalMerchandiseCents > 0
    ? t.markedRefundCents >= t.originalMerchandiseCents
    : t.orderedUnits > 0 && t.markedUnits >= t.orderedUnits && t.awaitingMarkingReturns === 0 && t.inProgressReturns === 0);
  const refundStatus = t.markedReturns > 0
    ? (fullyMarked ? 'FULLY_MARKED' : 'PARTIALLY_MARKED')
    : t.awaitingMarkingReturns > 0 ? 'AWAITING_MARKING' : 'NONE';
  return { ...t, returnStatus, refundStatus, hasReturn: t.activeReturns > 0,
    refundDueCount: t.awaitingMarkingReturns + (t.owedGoodwillCount ?? 0),
    refundDueCents: t.awaitingMarkingCents + (t.owedGoodwillCents ?? 0) };
}

/** Details already include their return records; derive without another query.
 * List endpoints use equivalent SQL aggregates to avoid loading whole histories. */
export function indicatorsFromRecords(order: {
  subtotal: Prisma.Decimal | string | number; discountAmount?: Prisma.Decimal | string | number;
  items: { quantity: number }[];
  returns: { status: string; items: { quantity: number; refundAmount: Prisma.Decimal | string | number; refundedAmount?: Prisma.Decimal | string | number | null }[] }[];
  goodwillRefunds?: { status: string; amount: Prisma.Decimal | string | number }[];
}) {
  const t: ReturnIndicatorTotals = { orderedUnits: order.items.reduce((sum, i) => sum + i.quantity, 0),
    originalMerchandiseCents: moneyCents(order.subtotal) - moneyCents(order.discountAmount ?? 0),
    activeReturns: 0, inProgressReturns: 0, inProgressUnits: 0, pendingRefundCents: 0,
    physicallyReturnedUnits: 0, awaitingMarkingReturns: 0, awaitingMarkingCents: 0,
    markedReturns: 0, markedUnits: 0, markedRefundCents: 0 };
  for (const r of order.returns) {
    if (['REJECTED', 'CANCELLED'].includes(r.status)) continue;
    t.activeReturns++;
    const units = r.items.reduce((sum, i) => sum + i.quantity, 0);
    const cents = r.items.reduce((sum, i) => sum + moneyCents(r.status === 'REFUNDED' ? i.refundedAmount ?? i.refundAmount : i.refundAmount), 0);
    if (['REQUESTED', 'APPROVED', 'IN_TRANSIT'].includes(r.status)) {
      t.inProgressReturns++; t.inProgressUnits += units; t.pendingRefundCents += cents;
    } else {
      t.physicallyReturnedUnits += units;
      if (r.status === 'RECEIVED') { t.awaitingMarkingReturns++; t.awaitingMarkingCents += cents; }
      if (r.status === 'REFUNDED') { t.markedReturns++; t.markedUnits += units; t.markedRefundCents += cents; }
    }
  }
  const owed = order.goodwillRefunds?.filter(g => g.status === 'OWED') ?? [];
  t.owedGoodwillCount = owed.length;
  t.owedGoodwillCents = owed.reduce((sum, g) => sum + moneyCents(g.amount), 0);
  return deriveReturnIndicators(t);
}

// One aggregate row per order. Rejected/cancelled returns disappear from all
// counters. Never read returnedQuantity or cumulative JSON refund breakdowns.
const indicatorsJoin = Prisma.sql`LEFT JOIN (
  SELECT r."orderID",
    COUNT(DISTINCT r."id")::int AS "activeReturns",
    COUNT(DISTINCT r."id") FILTER (WHERE r."status" IN ('REQUESTED','APPROVED','IN_TRANSIT'))::int AS "inProgressReturns",
    COALESCE(SUM(ri."quantity") FILTER (WHERE r."status" IN ('REQUESTED','APPROVED','IN_TRANSIT')),0)::int AS "inProgressUnits",
    COALESCE(SUM(ri."refundAmount") FILTER (WHERE r."status" IN ('REQUESTED','APPROVED','IN_TRANSIT')),0) * 100 AS "pendingRefundCents",
    COALESCE(SUM(ri."quantity") FILTER (WHERE r."status" IN ('RECEIVED','REFUNDED')),0)::int AS "physicallyReturnedUnits",
    COUNT(DISTINCT r."id") FILTER (WHERE r."status" = 'RECEIVED')::int AS "awaitingMarkingReturns",
    COALESCE(SUM(ri."refundAmount") FILTER (WHERE r."status" = 'RECEIVED'),0) * 100 AS "awaitingMarkingCents",
    COUNT(DISTINCT r."id") FILTER (WHERE r."status" = 'REFUNDED')::int AS "markedReturns",
    COALESCE(SUM(ri."quantity") FILTER (WHERE r."status" = 'REFUNDED'),0)::int AS "markedUnits",
    COALESCE(SUM(COALESCE(ri."refundedAmount", ri."refundAmount")) FILTER (WHERE r."status" = 'REFUNDED'),0) * 100 AS "markedRefundCents",
    COUNT(DISTINCT r."id") FILTER (WHERE r."status" = 'REQUESTED')::int AS requested,
    COUNT(DISTINCT r."id") FILTER (WHERE r."status" = 'IN_TRANSIT')::int AS transit
  FROM "return" r LEFT JOIN "returnitem" ri ON ri."returnID" = r."id"
  WHERE r."status" NOT IN ('REJECTED','CANCELLED') GROUP BY r."orderID"
) rs ON rs."orderID" = o."id"
LEFT JOIN (SELECT "orderID", SUM("quantity")::int AS units FROM "orderitem" GROUP BY "orderID") oq ON oq."orderID" = o."id"
LEFT JOIN (SELECT "orderID", COUNT(*)::int AS count, SUM(amount) * 100 AS cents FROM goodwillrefund
  WHERE status = 'OWED' GROUP BY "orderID") gw ON gw."orderID" = o.id`;

export async function readReturnIndicators(where: Prisma.Sql, filter?: OrderReturnFilter) {
  const filters: Record<OrderReturnFilter, Prisma.Sql> = {
    HAS_RETURN: Prisma.sql`rs."activeReturns" > 0`,
    IN_PROGRESS: Prisma.sql`rs."inProgressReturns" > 0`,
    AWAITING_REFUND_MARKING: Prisma.sql`rs."awaitingMarkingReturns" > 0`,
    REFUND_DUE: Prisma.sql`COALESCE(rs."awaitingMarkingReturns",0) + COALESCE(gw.count,0) > 0`,
    MARKED_REFUNDED: Prisma.sql`rs."markedReturns" > 0`,
    AWAITING_APPROVAL: Prisma.sql`rs.requested > 0`,
    IN_TRANSIT: Prisma.sql`rs.transit > 0`,
  };
  const rows = await prisma.$queryRaw<(ReturnIndicatorTotals & { id: string })[]>(Prisma.sql`
    SELECT o."id", COALESCE(oq.units,0) AS "orderedUnits",
      ((o."subtotal" - o."discountAmount") * 100)::float8 AS "originalMerchandiseCents",
      COALESCE(rs."activeReturns",0) AS "activeReturns",
      COALESCE(rs."inProgressReturns",0) AS "inProgressReturns",
      COALESCE(rs."inProgressUnits",0) AS "inProgressUnits",
      COALESCE(rs."pendingRefundCents",0)::float8 AS "pendingRefundCents",
      COALESCE(rs."physicallyReturnedUnits",0) AS "physicallyReturnedUnits",
      COALESCE(rs."awaitingMarkingReturns",0) AS "awaitingMarkingReturns",
      COALESCE(rs."awaitingMarkingCents",0)::float8 AS "awaitingMarkingCents",
      COALESCE(rs."markedReturns",0) AS "markedReturns",
      COALESCE(rs."markedUnits",0) AS "markedUnits",
      COALESCE(rs."markedRefundCents",0)::float8 AS "markedRefundCents",
      COALESCE(gw.count,0) AS "owedGoodwillCount", COALESCE(gw.cents,0)::float8 AS "owedGoodwillCents"
    FROM "order" o ${indicatorsJoin} WHERE ${where} AND ${filter ? filters[filter] : Prisma.sql`TRUE`}
  `);
  return new Map(rows.map(({ id, ...totals }) => [id, deriveReturnIndicators(totals)]));
}

export async function withReturnIndicators<T extends { id: string }>(orders: T[]) {
  if (!orders.length) return [];
  const summaries = await readReturnIndicators(Prisma.sql`o."id" IN (${Prisma.join(orders.map(o => Prisma.sql`${o.id}::uuid`))})`);
  return orders.map(o => ({ ...o, returnIndicators: summaries.get(o.id)! }));
}

/** Count requests, not joined lines or orders; sum saved line amounts. */
export async function returnWorkSummary() {
  const rows = await prisma.$queryRaw<{ status: string; count: number; amountCents: number }[]>(Prisma.sql`
    SELECT received."status", COUNT(*)::int AS count, SUM(received.amount)::float8 AS "amountCents"
    FROM (SELECT r."id", r."status"::text AS status, COALESCE(SUM(ri."refundAmount"),0) * 100 AS amount
      FROM "return" r LEFT JOIN "returnitem" ri ON ri."returnID" = r."id"
      WHERE r."status" IN ('REQUESTED','IN_TRANSIT','RECEIVED') GROUP BY r."id", r."status"
      UNION ALL SELECT id, 'OWED', amount * 100 FROM goodwillrefund WHERE status = 'OWED'
    ) received GROUP BY received."status"
  `);
  const value = (status: string) => { const row = rows.find(r => r.status === status); return { count: row?.count ?? 0, amountCents: row?.amountCents ?? 0 }; };
  const goodwill = value('OWED');
  const received = value('RECEIVED');
  return { awaitingApproval: value('REQUESTED'), inTransit: value('IN_TRANSIT'), awaitingRefundMarking: received,
    refundDue: { count: received.count + goodwill.count, amountCents: received.amountCents + goodwill.amountCents } };
}
