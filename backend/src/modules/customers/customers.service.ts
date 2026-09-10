import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/AppError';
import { recordAudit } from '../../lib/audit';
import type { ListCustomersQuery } from './customers.schema';

// Orders whose money counts toward a customer's lifetime spend / "orders
// placed" tally: everything except the two states where nothing was paid or
// kept. Same rule the storefront best-seller ranking uses.
const COUNTED_STATUSES = { notIn: ['CANCELLED', 'RETURNED'] } satisfies Prisma.EnumOrderStatusFilter;

const ZERO = new Prisma.Decimal(0);

/** "Registered" customers only — a row in `user` with the CUSTOMER role. Guest
 *  checkouts have no account (their orders carry `guestEmail`, `userID` null)
 *  and never appear here. Soft-deleted accounts are hidden. */
function baseWhere(q: ListCustomersQuery): Prisma.UserWhereInput {
  return {
    role: 'CUSTOMER',
    deletedAt: null,
    ...(q.status === 'active'
      ? { isActive: true }
      : q.status === 'inactive'
        ? { isActive: false }
        : {}),
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { email: { contains: q.search, mode: 'insensitive' } },
            { phone: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

const customerFields = {
  id: true,
  name: true,
  email: true,
  phone: true,
  isActive: true,
  dateCreated: true,
  emailVerified: true,
} satisfies Prisma.UserSelect;

const listSelect = {
  ...customerFields,
  _count: { select: { orders: true } },
} satisfies Prisma.UserSelect;

type CustomerRow = Prisma.UserGetPayload<{ select: typeof listSelect }>;

/** Per-customer order aggregates (spend, paid-order count, last-order date),
 *  keyed by user id — one grouped query for the whole page. */
async function orderStatsFor(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, { spent: Prisma.Decimal; paid: number; last: Date | null }>();
  const rows = await prisma.order.groupBy({
    by: ['userID'],
    where: { userID: { in: userIds }, status: COUNTED_STATUSES },
    _sum: { total: true },
    _max: { dateCreated: true },
    _count: { _all: true },
  });
  return new Map(
    rows.map((r) => [
      r.userID as string,
      { spent: r._sum.total ?? ZERO, paid: r._count._all, last: r._max.dateCreated ?? null },
    ])
  );
}

function toSummary(row: CustomerRow, stats: { spent: Prisma.Decimal; paid: number; last: Date | null } | undefined) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    isActive: row.isActive,
    emailVerified: row.emailVerified !== null,
    joinedAt: row.dateCreated,
    orderCount: row._count.orders,
    paidOrderCount: stats?.paid ?? 0,
    totalSpent: (stats?.spent ?? ZERO).toString(),
    lastOrderAt: stats?.last ?? null,
  };
}

export async function listCustomers(q: ListCustomersQuery) {
  const where = baseWhere(q);
  const orderBy: Prisma.UserOrderByWithRelationInput =
    q.sort === 'oldest'
      ? { dateCreated: 'asc' }
      : q.sort === 'name'
        ? { name: 'asc' }
        : q.sort === 'orders'
          ? { orders: { _count: 'desc' } }
          : { dateCreated: 'desc' };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: listSelect,
    }),
    prisma.user.count({ where }),
  ]);

  const stats = await orderStatsFor(rows.map((r) => r.id));
  return {
    customers: rows.map((r) => toSummary(r, stats.get(r.id))),
    total,
    page: q.page,
    pageSize: q.pageSize,
  };
}

/** One customer with every order they've placed (newest first, line items
 *  included) — backs the expandable row on the admin Customers page. */
export async function getCustomer(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, role: 'CUSTOMER', deletedAt: null },
    select: customerFields,
  });
  if (!user) throw new AppError('NOT_FOUND', 'Customer not found');

  const orders = await prisma.order.findMany({
    where: { userID: id },
    orderBy: { dateCreated: 'desc' },
    include: { items: true },
  });

  const counted = orders.filter((o) => o.status !== 'CANCELLED' && o.status !== 'RETURNED');
  const totalSpent = counted.reduce((sum, o) => sum.add(o.total), ZERO);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    isActive: user.isActive,
    emailVerified: user.emailVerified !== null,
    joinedAt: user.dateCreated,
    orderCount: orders.length,
    paidOrderCount: counted.length,
    totalSpent: totalSpent.toString(),
    lastOrderAt: orders[0]?.dateCreated ?? null,
    orders,
  };
}

/** Block / unblock a customer's account. A blocked customer can't sign in or
 *  check out; their order history is untouched. Reversible, so no step-up. */
export async function setCustomerActive(actorId: string, id: string, isActive: boolean) {
  const existing = await prisma.user.findFirst({
    where: { id, role: 'CUSTOMER', deletedAt: null },
    select: { id: true, isActive: true },
  });
  if (!existing) throw new AppError('NOT_FOUND', 'Customer not found');

  if (existing.isActive !== isActive) {
    await prisma.user.update({ where: { id }, data: { isActive } });
    await recordAudit({
      entityType: 'user',
      entityID: id,
      action: isActive ? 'customer.reactivated' : 'customer.deactivated',
      actorID: actorId,
      metadata: {},
    });
  }

  const [row, stats] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id }, select: listSelect }),
    orderStatsFor([id]),
  ]);
  return toSummary(row, stats.get(id));
}
