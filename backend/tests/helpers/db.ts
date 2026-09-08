import { prisma } from '../../src/config/prisma';

// Every mapped table (see @@map in prisma/schema.prisma). TRUNCATE ... CASCADE
// clears them regardless of FK order; RESTART IDENTITY resets any sequences.
const TABLES = [
  'storehours',
  'storelocation',
  'reviewimage',
  'announcementline',
  'deliveryrate',
  'sitesetting',
  'discount',
  'coupon',
  'role',
  'blacklistentry',
  'checkoutotp',
  'pushsubscription',
  'stockmovement',
  'orderaccesstoken',
  'orderitem',
  'order',
  'cartitem',
  'cart',
  'favorite',
  'auditlog',
  'oauthaccount',
  'passwordresettoken',
  'emailverificationtoken',
  'refreshtoken',
  'productimage',
  'productvariant',
  'product',
  'categoryimage',
  'category',
  'collectionimage',
  'collection',
  'address',
  'user',
];

export async function resetDb() {
  const list = TABLES.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
