import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

/** Exactly one row per order line, regardless of the number of return requests.
 * Effective allocations are immutable; legacy markings use calculated amounts.
 * Never sum cumulative JSON breakdowns. */
export const lineReturnsJoin = Prisma.sql`LEFT JOIN (
  SELECT ri."orderItemID",
    COALESCE(SUM(COALESCE(ri."refundedAmount", ri."refundAmount")) FILTER (WHERE r."status" = 'REFUNDED'), 0) AS refunded,
    COALESCE(SUM(ri."refundAmount") FILTER (WHERE r."status" = 'RECEIVED'), 0) AS awaiting,
    COALESCE(SUM(ri."quantity") FILTER (WHERE r."status" IN ('RECEIVED', 'REFUNDED')), 0) AS returned
  FROM "returnitem" ri JOIN "return" r ON r."id" = ri."returnID"
  GROUP BY ri."orderItemID"
) lr ON lr."orderItemID" = oi."id"`;

export const lineNet = Prisma.sql`(oi."lineTotal" - COALESCE(lr.refunded, 0))`;
export const lineRetained = Prisma.sql`(oi."quantity" - COALESCE(lr.returned, 0))`;

/** Aggregate to one row per order BEFORE joining order amounts/fees. */
export const orderMetricsJoin = Prisma.sql`LEFT JOIN (
  SELECT oi."orderID", SUM(oi."quantity") AS ordered,
    SUM(COALESCE(lr.refunded, 0)) AS refunded, SUM(COALESCE(lr.awaiting, 0)) AS awaiting,
    SUM(COALESCE(lr.returned, 0)) AS returned
  FROM "orderitem" oi ${lineReturnsJoin} GROUP BY oi."orderID"
) om ON om."orderID" = o."id"`;
export const orderMerchandise = Prisma.sql`(o."subtotal" - o."discountAmount")`;
export const orderNet = Prisma.sql`(${orderMerchandise} - COALESCE(om.refunded, 0))`;

// Goodwill is an order-level deduction only. Keep line merchandise metrics and
// the existing revenue basis (delivery reported separately) unchanged.
export const goodwillJoin = Prisma.sql`LEFT JOIN (
  SELECT "orderID", COALESCE(SUM(amount) FILTER (WHERE status = 'PAID'),0) AS paid,
    COALESCE(SUM(amount) FILTER (WHERE status = 'OWED'),0) AS owed,
    COUNT(*) FILTER (WHERE status = 'OWED')::int AS owed_count
  FROM goodwillrefund GROUP BY "orderID"
) gw ON gw."orderID" = o.id`;
export const netOrderRevenue = Prisma.sql`(${orderNet} - COALESCE(gw.paid,0))`;

// Aggregate delivery once per return, independently of its line count.
export const deliveryRefundsJoin = Prisma.sql`LEFT JOIN (
  SELECT "orderID", SUM("deliveryRefundAmount") FILTER (WHERE status = 'REFUNDED') AS amount,
    COUNT(*) FILTER (WHERE status = 'RECEIVED')::int AS received_count FROM "return" GROUP BY "orderID"
) dr ON dr."orderID" = o.id`;

export interface MerchandiseMetrics {
  merchandiseValue: number;
  merchandiseMarkedRefunded: number;
  netMerchandiseValue: number;
  receivedReturnsAwaitingRefundMarking: number;
  orderedUnits: number;
  physicallyReturnedUnits: number;
  retainedUnits: number;
  paidGoodwill?: number;
  netOrderRevenue?: number;
  refundDueAmount?: number;
  refundDueCount?: number;
}

export async function merchandiseSummary(where: Prisma.Sql) {
  const [row] = await prisma.$queryRaw<(MerchandiseMetrics & { orders: number; deliveryRevenue: number })[]>(Prisma.sql`
    SELECT COUNT(*)::int AS orders,
      COALESCE(SUM(${orderMerchandise}), 0)::float8 AS "merchandiseValue",
      COALESCE(SUM(om.refunded), 0)::float8 AS "merchandiseMarkedRefunded",
      COALESCE(SUM(${orderNet}), 0)::float8 AS "netMerchandiseValue",
      COALESCE(SUM(gw.paid),0)::float8 AS "paidGoodwill",
      COALESCE(SUM(${netOrderRevenue}),0)::float8 AS "netOrderRevenue",
      COALESCE(SUM(COALESCE(om.awaiting,0) + COALESCE(gw.owed,0)),0)::float8 AS "refundDueAmount",
      COALESCE(SUM(COALESCE(dr.received_count,0) + COALESCE(gw.owed_count,0)),0)::int AS "refundDueCount",
      COALESCE(SUM(om.awaiting), 0)::float8 AS "receivedReturnsAwaitingRefundMarking",
      COALESCE(SUM(om.ordered), 0)::int AS "orderedUnits",
      COALESCE(SUM(om.returned), 0)::int AS "physicallyReturnedUnits",
      COALESCE(SUM(om.ordered - om.returned), 0)::int AS "retainedUnits",
      COALESCE(SUM(o."deliveryFee" - COALESCE(dr.amount, 0)), 0)::float8 AS "deliveryRevenue"
    FROM "order" o ${orderMetricsJoin} ${deliveryRefundsJoin} ${goodwillJoin} WHERE ${where}
  `);
  return row;
}

export const MERCHANDISE_NOTE = 'Orders placed in the selected period, adjusted through today; excludes CANCELLED orders. Net order revenue is net merchandise minus paid goodwill, with delivery revenue reported separately. Goodwill is never allocated to merchandise lines. Refund due includes received merchandise calculations and owed goodwill; delivery is chosen when paying a return. Historic refunded returns may have no payout record. Delivery revenue is delivery fees charged minus delivery refunded.';
