import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { lineReturnsJoin, lineNet, lineRetained, orderMetricsJoin, orderMerchandise, orderNet, merchandiseSummary, MERCHANDISE_NOTE } from '../../lib/merchandise-metrics';
import * as ga from './ga.service';
import type { AnalyticsRangeQuery } from './analytics.schema';

/** Read-only order-date cohort reports. All merchandise values are post-coupon;
 * saved incremental refunds are deducted only when marked REFUNDED. Delivery
 * fees stay separate. Physical return quantities are recognized at RECEIVED. */

type Granularity = AnalyticsRangeQuery['granularity'];

interface Range {
  from: Date;
  to: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveRange(q: Pick<AnalyticsRangeQuery, 'from' | 'to'>): Range {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 30 * DAY_MS);
  return { from, to };
}

const CANCELLED = Prisma.sql`'CANCELLED'`;

/** date_trunc bucket expression for a validated granularity. */
const bucket = (g: Granularity, col: Prisma.Sql) => Prisma.sql`date_trunc(${g}::text, ${col})`;

const num = (v: unknown) => (v == null ? 0 : Number(v));

const lineMetricColumns = Prisma.sql`
  SUM(oi."lineTotal")::float8 AS "merchandiseValue",
  SUM(COALESCE(lr.refunded, 0))::float8 AS "merchandiseMarkedRefunded",
  SUM(${lineNet})::float8 AS "netMerchandiseValue",
  SUM(COALESCE(lr.awaiting, 0))::float8 AS "receivedReturnsAwaitingRefundMarking",
  SUM(oi."quantity")::int AS "orderedUnits",
  SUM(COALESCE(lr.returned, 0))::int AS "physicallyReturnedUnits",
  SUM(${lineRetained})::int AS "retainedUnits"`;

// --------------------------------------------------------------- overview ----

export async function overview(q: AnalyticsRangeQuery) {
  const { from, to } = resolveRange(q);
  const where = Prisma.sql`o."dateCreated" BETWEEN ${from} AND ${to} AND o."status" <> ${CANCELLED}`;
  const [agg, newCustomers, lowStock, series, returning, delivered, funnel] =
    await Promise.all([
      merchandiseSummary(where),
      prisma.user.count({
        where: { role: 'CUSTOMER', dateCreated: { gte: from, lte: to } },
      }),
      prisma.productVariant.count({
        where: {
          stockQuantity: { gt: 0, lte: q.lowStockThreshold },
          product: { deletedAt: null },
        },
      }),
      revenueSeries(from, to, q.granularity),
      returningCustomerCount(from, to),
      merchandiseSummary(Prisma.sql`${where} AND o."status" IN ('DELIVERED', 'RETURNED')`),
      ga.funnel({ from, to }),
    ]);

  const orders = agg.orders;
  const revenue = agg.netMerchandiseValue;
  const units = agg.orderedUnits;

  return {
    range: { from, to },
    kpis: {
      ...agg,
      revenue,
      deliveredRevenue: delivered.netMerchandiseValue,
      orders,
      averageOrderValue: orders ? revenue / orders : 0,
      itemsPerOrder: orders ? units / orders : 0,
      unitsSold: agg.retainedUnits,
      newCustomers,
      returningCustomers: returning,
      lowStockVariants: lowStock,
    },
    revenueSeries: series,
    funnel,
    note: MERCHANDISE_NOTE,
  };
}

// ------------------------------------------------------------------ sales ----

export async function sales(q: AnalyticsRangeQuery) {
  const { from, to } = resolveRange(q);

  const [summary, series, byCategory, byProduct, bySize, byColour] = await Promise.all([
    merchandiseSummary(Prisma.sql`o."dateCreated" BETWEEN ${from} AND ${to} AND o."status" <> ${CANCELLED}`),
    revenueSeries(from, to, q.granularity),
    // Attributed to the product's PRIMARY category only — reporting is one of
    // the stated reasons a primary category exists (see the Product model's
    // doc comment) — not every additional placement it's also linked into.
    itemBreakdown(from, to, Prisma.sql`c."nameEn"`, Prisma.sql`
      JOIN "productvariant" v ON v."id" = oi."variantID"
      JOIN "product" p ON p."id" = v."productID"
      JOIN "category" c ON c."id" = p."primaryCategoryID"
    `),
    itemBreakdown(from, to, Prisma.sql`oi."productName"`, Prisma.empty),
    itemBreakdown(from, to, Prisma.sql`COALESCE(oi."size", '—')`, Prisma.empty),
    itemBreakdown(from, to, Prisma.sql`COALESCE(oi."color", '—')`, Prisma.empty),
  ]);

  return {
    range: { from, to },
    summary,
    revenueSeries: series,
    byCategory,
    byProduct,
    bySize,
    byColour,
    note: MERCHANDISE_NOTE,
  };
}

// -------------------------------------------------------------- customers ----

export async function customers(q: AnalyticsRangeQuery) {
  const { from, to } = resolveRange(q);

  const [totals, newCustomers, returning, avgGap, series, top] = await Promise.all([
    prisma.$queryRaw<{ with_orders: number; repeat_customers: number; avg_ltv: number }[]>(Prisma.sql`
      SELECT
        COUNT(*) FILTER (WHERE cnt >= 1)::int AS with_orders,
        COUNT(*) FILTER (WHERE cnt >= 2)::int AS repeat_customers,
        COALESCE(AVG(spend), 0)::float8       AS avg_ltv
      FROM (
        SELECT o."userID", COUNT(*)::int AS cnt, SUM(${orderNet})::float8 AS spend
        FROM "order" o ${orderMetricsJoin}
        WHERE o."userID" IS NOT NULL AND o."status" <> ${CANCELLED}
        GROUP BY o."userID"
      ) per_customer
    `),
    prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT o."userID")::int AS count
      FROM "order" o
      WHERE o."userID" IS NOT NULL
        AND o."dateCreated" BETWEEN ${from} AND ${to}
        AND o."status" <> ${CANCELLED}
        AND NOT EXISTS (
          SELECT 1 FROM "order" p
          WHERE p."userID" = o."userID" AND p."status" <> ${CANCELLED}
            AND p."dateCreated" < ${from}
        )
    `),
    prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT o."userID")::int AS count
      FROM "order" o
      WHERE o."userID" IS NOT NULL
        AND o."dateCreated" BETWEEN ${from} AND ${to}
        AND o."status" <> ${CANCELLED}
        AND EXISTS (
          SELECT 1 FROM "order" p
          WHERE p."userID" = o."userID" AND p."status" <> ${CANCELLED}
            AND p."dateCreated" < ${from}
        )
    `),
    prisma.$queryRaw<{ avg_days: number | null }[]>(Prisma.sql`
      SELECT AVG(gap)::float8 AS avg_days FROM (
        SELECT EXTRACT(EPOCH FROM (
          o."dateCreated" - LAG(o."dateCreated") OVER (PARTITION BY o."userID" ORDER BY o."dateCreated")
        )) / 86400 AS gap
        FROM "order" o
        WHERE o."userID" IS NOT NULL AND o."status" <> ${CANCELLED}
      ) gaps
      WHERE gap IS NOT NULL
    `),
    prisma.$queryRaw<{ bucket: Date; new_customers: number; returning_orders: number }[]>(Prisma.sql`
      SELECT ${bucket(q.granularity, Prisma.sql`o."dateCreated"`)} AS bucket,
        COUNT(*) FILTER (WHERE o."dateCreated" = fo.first_order)::int  AS new_customers,
        COUNT(*) FILTER (WHERE o."dateCreated" <> fo.first_order)::int AS returning_orders
      FROM "order" o
      JOIN (
        SELECT "userID", MIN("dateCreated") AS first_order
        FROM "order" WHERE "status" <> ${CANCELLED} AND "userID" IS NOT NULL
        GROUP BY "userID"
      ) fo ON fo."userID" = o."userID"
      WHERE o."dateCreated" BETWEEN ${from} AND ${to}
        AND o."status" <> ${CANCELLED} AND o."userID" IS NOT NULL
      GROUP BY 1 ORDER BY 1
    `),
    prisma.$queryRaw<
      { id: string; name: string; email: string; orders: number; revenue: number }[]
    >(Prisma.sql`
      SELECT u."id", u."name", u."email",
        COUNT(o.*)::int AS orders,
        SUM(${orderNet})::float8 AS revenue
      FROM "order" o JOIN "user" u ON u."id" = o."userID" ${orderMetricsJoin}
      WHERE o."status" <> ${CANCELLED}
        AND o."dateCreated" BETWEEN ${from} AND ${to}
      GROUP BY u."id", u."name", u."email"
      ORDER BY revenue DESC
      LIMIT 10
    `),
  ]);

  const t = totals[0] ?? { with_orders: 0, repeat_customers: 0, avg_ltv: 0 };
  const totalOrders = await prisma.order.count({
    where: { userID: { not: null }, status: { not: 'CANCELLED' } },
  });

  return {
    range: { from, to },
    kpis: {
      customersWithOrders: t.with_orders,
      newCustomers: newCustomers[0]?.count ?? 0,
      returningCustomers: returning[0]?.count ?? 0,
      repeatPurchaseRate: t.with_orders ? t.repeat_customers / t.with_orders : 0,
      ordersPerCustomer: t.with_orders ? totalOrders / t.with_orders : 0,
      lifetimeValue: num(t.avg_ltv),
      avgDaysBetweenPurchases: avgGap[0]?.avg_days ?? null,
    },
    newVsReturningSeries: series,
    topCustomers: top,
    note: MERCHANDISE_NOTE + ' Guest orders (no account) are excluded. LTV / repeat rate are all-time; the series and top customers are range-scoped.',
  };
}

// -------------------------------------------------------------- inventory ----

export async function inventory(q: AnalyticsRangeQuery) {
  const { from, to } = resolveRange(q);
  const threshold = q.lowStockThreshold;

  const [stock, sold, lowStock, outOfStock, bySize, byColour, slowMovers, movements] =
    await Promise.all([
      prisma.$queryRaw<{ units: number; value: number }[]>(Prisma.sql`
        SELECT COALESCE(SUM(v."stockQuantity"), 0)::int AS units,
               COALESCE(SUM(v."stockQuantity" * COALESCE(v."price", p."price")), 0)::float8 AS value
        FROM "productvariant" v JOIN "product" p ON p."id" = v."productID"
        WHERE p."deletedAt" IS NULL
      `),
      merchandiseSummary(Prisma.sql`o."dateCreated" BETWEEN ${from} AND ${to} AND o."status" <> ${CANCELLED}`),
      prisma.$queryRaw<
        { sku: string; product: string; size: string | null; color: string | null; stock: number }[]
      >(Prisma.sql`
        SELECT v."sku", p."nameEn" AS product, v."size", v."color", v."stockQuantity" AS stock
        FROM "productvariant" v JOIN "product" p ON p."id" = v."productID"
        WHERE p."deletedAt" IS NULL AND v."stockQuantity" > 0 AND v."stockQuantity" <= ${threshold}
        ORDER BY v."stockQuantity" ASC, p."nameEn" ASC
        LIMIT 100
      `),
      prisma.$queryRaw<
        { sku: string; product: string; size: string | null; color: string | null }[]
      >(Prisma.sql`
        SELECT v."sku", p."nameEn" AS product, v."size", v."color"
        FROM "productvariant" v JOIN "product" p ON p."id" = v."productID"
        WHERE p."deletedAt" IS NULL AND v."stockQuantity" <= 0
        ORDER BY p."nameEn" ASC
        LIMIT 100
      `),
      itemBreakdown(from, to, Prisma.sql`COALESCE(oi."size", '—')`, Prisma.empty),
      itemBreakdown(from, to, Prisma.sql`COALESCE(oi."color", '—')`, Prisma.empty),
      prisma.$queryRaw<{ product: string; sku: string }[]>(Prisma.sql`
        SELECT p."nameEn" AS product, p."sku"
        FROM "product" p
        WHERE p."deletedAt" IS NULL AND p."isActive" = true
          AND NOT EXISTS (
            SELECT 1
            FROM "orderitem" oi
            JOIN "productvariant" v ON v."id" = oi."variantID"
            JOIN "order" o ON o."id" = oi."orderID"
            WHERE v."productID" = p."id"
              AND o."dateCreated" BETWEEN ${from} AND ${to}
              AND o."status" <> ${CANCELLED}
          )
        ORDER BY p."nameEn" ASC
        LIMIT 20
      `),
      prisma.stockMovement.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          quantity: true,
          type: true,
          reason: true,
          createdAt: true,
          variant: { select: { sku: true, product: { select: { nameEn: true } } } },
        },
      }),
    ]);

  const currentStock = stock[0]?.units ?? 0;
  const unitsSold = sold.retainedUnits;

  return {
    range: { from, to },
    kpis: {
      stockUnits: currentStock,
      stockValue: num(stock[0]?.value),
      unitsSold,
      orderedUnits: sold.orderedUnits,
      physicallyReturnedUnits: sold.physicallyReturnedUnits,
      retainedUnits: sold.retainedUnits,
      sellThroughRate: unitsSold + currentStock ? unitsSold / (unitsSold + currentStock) : 0,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
    },
    lowStock,
    outOfStock,
    bestSellingSizes: bySize,
    bestSellingColours: byColour,
    slowMovers,
    recentMovements: movements,
    note: `Low stock = a variant with 1–${threshold} units. Slow movers = active products with no sales in range.`,
  };
}

// --------------------------------------------------------------- products ----

export async function products(q: AnalyticsRangeQuery) {
  const { from, to } = resolveRange(q);

  const [rows, views] = await Promise.all([
    prisma.$queryRaw<
      { name: string; sku: string; productId: string; units: number; orderedUnits: number; revenue: number; orders: number; buyers: number }[]
    >(Prisma.sql`
      SELECT oi."productName" AS name, oi."productSKU" AS sku, pv."productID" AS "productId",
        SUM(${lineRetained})::int AS units,
        ${lineMetricColumns},
        SUM(${lineNet})::float8 AS revenue,
        COUNT(DISTINCT oi."orderID")::int AS orders,
        COUNT(DISTINCT o."userID")::int   AS buyers
      FROM "orderitem" oi ${lineReturnsJoin}
      JOIN "order" o ON o."id" = oi."orderID"
      JOIN "productvariant" pv ON pv."id" = oi."variantID"
      WHERE o."dateCreated" BETWEEN ${from} AND ${to} AND o."status" <> ${CANCELLED}
      GROUP BY 1, 2, pv."productID"
      ORDER BY revenue DESC
      LIMIT 100
    `),
    ga.productViews({ from, to }),
  ]);

  // GA4 events set `item_id` to the product SKU (see frontend lib/analytics/ga.ts),
  // so the two sides join on SKU.
  const viewsBySku = new Map<string, number>();
  if (views.configured) {
    for (const r of views.rows) viewsBySku.set(String(r.itemId), Number(r.itemsViewed));
  }

  const merged = rows.map((r) => {
    const gaViews = viewsBySku.get(r.sku) ?? null;
    return {
      ...r,
      views: gaViews,
      viewToPurchaseRate: gaViews ? r.orderedUnits / gaViews : null,
      viewToCartRate: null as number | null, // needs per-SKU add_to_cart — see /products GA rows
    };
  });

  return {
    range: { from, to },
    products: merged,
    ga: views.configured ? { configured: true as const, rows: views.rows } : { configured: false as const },
    note: MERCHANDISE_NOTE + ' Purchase side is first-party; `views` / rates come from GA4 (null when GA4 is not configured).',
  };
}

// GA4-sourced passthroughs — range resolved here, report + cache in ga.service.

export function visitors(q: AnalyticsRangeQuery) {
  return ga.visitors(resolveRange(q));
}

export function funnelReport(q: AnalyticsRangeQuery) {
  return ga.funnel(resolveRange(q));
}

// ------------------------------------------------------------------ helpers --

function revenueSeries(from: Date, to: Date, g: Granularity) {
  return prisma.$queryRaw<{ bucket: Date; revenue: number; orders: number }[]>(Prisma.sql`
    SELECT ${bucket(g, Prisma.sql`o."dateCreated"`)} AS bucket,
      SUM(${orderNet})::float8 AS revenue,
      SUM(${orderMerchandise})::float8 AS "merchandiseValue",
      SUM(COALESCE(om.refunded, 0))::float8 AS "merchandiseMarkedRefunded",
      SUM(${orderNet})::float8 AS "netMerchandiseValue",
      COUNT(*)::int AS orders
    FROM "order" o ${orderMetricsJoin}
    WHERE o."dateCreated" BETWEEN ${from} AND ${to} AND o."status" <> ${CANCELLED}
    GROUP BY 1 ORDER BY 1
  `);
}

function itemBreakdown(from: Date, to: Date, label: Prisma.Sql, joins: Prisma.Sql) {
  return prisma.$queryRaw<{ label: string; revenue: number; units: number }[]>(Prisma.sql`
    SELECT ${label} AS label,
      SUM(${lineNet})::float8 AS revenue, SUM(${lineRetained})::int AS units,
      ${lineMetricColumns}
    FROM "orderitem" oi ${lineReturnsJoin}
    JOIN "order" o ON o."id" = oi."orderID"
    ${joins}
    WHERE o."dateCreated" BETWEEN ${from} AND ${to} AND o."status" <> ${CANCELLED}
    GROUP BY 1 ORDER BY revenue DESC NULLS LAST LIMIT 50
  `);
}

function returningCustomerCount(from: Date, to: Date) {
  return prisma
    .$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT o."userID")::int AS count
      FROM "order" o
      WHERE o."userID" IS NOT NULL
        AND o."dateCreated" BETWEEN ${from} AND ${to}
        AND o."status" <> ${CANCELLED}
        AND EXISTS (
          SELECT 1 FROM "order" p
          WHERE p."userID" = o."userID" AND p."status" <> ${CANCELLED}
            AND p."dateCreated" < ${from}
        )
    `)
    .then((r) => r[0]?.count ?? 0);
}
