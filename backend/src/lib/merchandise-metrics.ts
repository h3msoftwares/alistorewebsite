import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

/** Exactly one row per order line, regardless of the number of return requests.
 * Only the incremental saved refundAmount is summed, never JSON breakdowns. */
export const lineReturnsJoin = Prisma.sql`LEFT JOIN (
  SELECT ri."orderItemID",
    COALESCE(SUM(ri."refundAmount") FILTER (WHERE r."status" = 'REFUNDED'), 0) AS refunded,
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

export interface MerchandiseMetrics {
  merchandiseValue: number;
  merchandiseMarkedRefunded: number;
  netMerchandiseValue: number;
  receivedReturnsAwaitingRefundMarking: number;
  orderedUnits: number;
  physicallyReturnedUnits: number;
  retainedUnits: number;
}

export async function merchandiseSummary(where: Prisma.Sql) {
  const [row] = await prisma.$queryRaw<(MerchandiseMetrics & { orders: number; deliveryRevenue: number })[]>(Prisma.sql`
    SELECT COUNT(*)::int AS orders,
      COALESCE(SUM(${orderMerchandise}), 0)::float8 AS "merchandiseValue",
      COALESCE(SUM(om.refunded), 0)::float8 AS "merchandiseMarkedRefunded",
      COALESCE(SUM(${orderNet}), 0)::float8 AS "netMerchandiseValue",
      COALESCE(SUM(om.awaiting), 0)::float8 AS "receivedReturnsAwaitingRefundMarking",
      COALESCE(SUM(om.ordered), 0)::int AS "orderedUnits",
      COALESCE(SUM(om.returned), 0)::int AS "physicallyReturnedUnits",
      COALESCE(SUM(om.ordered - om.returned), 0)::int AS "retainedUnits",
      COALESCE(SUM(o."deliveryFee"), 0)::float8 AS "deliveryRevenue"
    FROM "order" o ${orderMetricsJoin} WHERE ${where}
  `);
  return row;
}

export const MERCHANDISE_NOTE = 'Orders placed in the selected period, adjusted through today. Merchandise is after coupons and amounts marked refunded; excludes CANCELLED orders. Refund marking is an administrative record, not proof of payment. Delivery fees are separate and unchanged.';
