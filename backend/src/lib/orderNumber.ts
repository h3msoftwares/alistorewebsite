import type { Prisma, PrismaClient } from '@prisma/client';

// Unambiguous alphabet (no 0/O, 1/I) for a readable order number.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Human-facing order number, e.g. `AS-20260906-7F3K9Q`. Not a DB key — the
 *  Order row's uuid `id` is. The 6-char base-31 suffix is ~887M values per day,
 *  so same-day collisions are vanishingly rare; checkout additionally retries
 *  against the DB (see `generateUniqueOrderNumber`). */
export function generateOrderNumber(): string {
  const d = new Date();
  const ymd =
    `${d.getFullYear()}` +
    `${String(d.getMonth() + 1).padStart(2, '0')}` +
    `${String(d.getDate()).padStart(2, '0')}`;
  let suffix = '';
  for (let i = 0; i < 6; i++) suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `AS-${ymd}-${suffix}`;
}

type Db = PrismaClient | Prisma.TransactionClient;

/** A `generateOrderNumber()` value confirmed not to collide with an existing
 *  `Order.orderNumber` (which is `@unique`). Retries a handful of times, then
 *  falls back to a timestamp-suffixed value that cannot realistically clash. */
export async function generateUniqueOrderNumber(db: Db, attempts = 6): Promise<string> {
  for (let i = 0; i < attempts; i++) {
    const candidate = generateOrderNumber();
    const exists = await db.order.findUnique({
      where: { orderNumber: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;
  }
  return `${generateOrderNumber()}-${Date.now().toString(36).toUpperCase()}`;
}
