import { prisma } from '../../src/config/prisma';

// Every mapped table (see @@map in prisma/schema.prisma). TRUNCATE ... CASCADE
// clears them regardless of FK order; RESTART IDENTITY resets any sequences.
const TABLES = [
  'backupsettings',
  'gmailsendcredential',
  'drivecredential',
  'storehours',
  'storelocation',
  'reviewimage',
  'homeshowcase',
  'announcementline',
  'deliveryrate',
  'sitesetting',
  'promotionproduct',
  'promotioncategory',
  'promotioncollection',
  'promotion',
  'collectionrule',
  'loyaltyaward',
  'loyaltyrule',
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
  'emailchangerequest',
  'refreshtoken',
  'productimage',
  'productvariant',
  'productcategory',
  'collectionproduct',
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
