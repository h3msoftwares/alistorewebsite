import { prisma } from '../../src/config/prisma';
import { recordCollection } from '../../src/modules/payments/collection.service';

/** Explicit evidence for a test purchase, never a migration/backfill. */
export async function collectTestOrder(orderID: string, actorID: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderID } });
  return recordCollection(orderID, { collected: true, amount: Number(order.total), currency: order.currency,
    collectedAt: new Date().toISOString(), collectorName: 'Test courier', reference: `Test receipt ${order.orderNumber}` }, actorID);
}
