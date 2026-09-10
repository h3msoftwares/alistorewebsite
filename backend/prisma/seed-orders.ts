/**
 * Load-test fixture: registered customers + historical orders + an
 * effectively-infinite-stock checkout product.
 *
 * Run AFTER `npm run seed:large` (needs a populated catalogue):
 *   SEED_ORDERS=2000 SEED_ORDERS_CUSTOMERS=200 npx tsx prisma/seed-orders.ts
 *
 * Why it exists: seed:large creates zero Order / OrderItem / customer rows, so
 * /api/admin/*, /api/admin/analytics/*, GET /api/orders/mine and
 * sort=best_selling would otherwise load-test against empty tables. This also
 * mints one `LOADTEST-CHECKOUT` product whose variants have 1e9 stock so the
 * checkout load scenario never runs dry (and never perturbs real catalogue
 * stock).
 *
 * Idempotent-ish: safe to re-run; customers/product upsert by natural key,
 * orders are skipped if the target count already exists.
 */
import { PrismaClient, type OrderStatus } from '@prisma/client';
import argon2 from 'argon2';

try { process.loadEnvFile(); } catch { /* env provided externally */ }

const prisma = new PrismaClient();

export const LOAD_CUSTOMER_PASSWORD = 'LoadTest!234';
export const LOAD_CUSTOMER_DOMAIN = 'loadtest.local';
export const LOAD_CHECKOUT_SKU = 'LOADTEST-CHECKOUT';

const N_CUSTOMERS = Math.max(1, Number(process.env.SEED_ORDERS_CUSTOMERS) || 200);
const N_ORDERS = Math.max(0, Number(process.env.SEED_ORDERS) || 2000);
const DAYS_BACK = Math.max(1, Number(process.env.SEED_ORDERS_DAYS) || 120);

// Weighted status mix — roughly a real COD store's distribution.
const STATUS_MIX: [OrderStatus, number][] = [
  ['DELIVERED', 0.55], ['CONFIRMED', 0.15], ['SHIPPED', 0.12],
  ['PENDING', 0.1], ['CANCELLED', 0.06], ['RETURNED', 0.02],
];
function pickStatus(r: number): OrderStatus {
  let acc = 0;
  for (const [s, w] of STATUS_MIX) { acc += w; if (r <= acc) return s; }
  return 'DELIVERED';
}

const REGIONS = ['BEIRUT', 'MOUNT_LEBANON', 'NORTH', 'SOUTH', 'BEKAA'];
const rnd = (n: number) => Math.floor(Math.random() * n);
const money = (n: number) => Math.round(n * 100) / 100;

async function main() {
  console.log(`[seed:orders] customers=${N_CUSTOMERS} orders=${N_ORDERS} daysBack=${DAYS_BACK}`);

  // ---- 1. Registered, verified customers -------------------------------------
  const pwHash = await argon2.hash(LOAD_CUSTOMER_PASSWORD);
  const customerIds: string[] = [];
  for (let i = 1; i <= N_CUSTOMERS; i++) {
    const email = `loadcust+${i}@${LOAD_CUSTOMER_DOMAIN}`;
    const u = await prisma.user.upsert({
      where: { email },
      update: { emailVerified: new Date(), passwordHash: pwHash, isActive: true },
      create: {
        email, name: `Load Customer ${i}`, role: 'CUSTOMER',
        passwordHash: pwHash, emailVerified: new Date(),
        phone: `+9617${String(100000 + i).slice(-6)}`,
      },
      select: { id: true },
    });
    customerIds.push(u.id);
  }
  console.log(`[seed:orders]   ${customerIds.length} customers ready (pw: ${LOAD_CUSTOMER_PASSWORD})`);

  // ---- 2. Infinite-stock checkout product ----------------------------------
  const anyCategory = await prisma.category.findFirst({ select: { id: true, collectionID: true } });
  if (!anyCategory) throw new Error('No categories — run `npm run seed:large` first.');
  const checkoutProduct = await prisma.product.upsert({
    where: { sku: LOAD_CHECKOUT_SKU },
    update: { isActive: true, deletedAt: null },
    create: {
      sku: LOAD_CHECKOUT_SKU,
      nameEn: 'Load Test Checkout Item', nameAr: 'عنصر اختبار الحمل',
      descriptionEn: 'Synthetic product for checkout load testing. Not for sale.',
      categoryID: anyCategory.id, collectionID: anyCategory.collectionID,
      price: 10, quantity: 1_000_000_000,
    },
    select: { id: true },
  });
  const checkoutVariantIds: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const sku = `${LOAD_CHECKOUT_SKU}-V${i}`;
    const v = await prisma.productVariant.upsert({
      where: { sku },
      update: { stockQuantity: 1_000_000_000 },
      create: { productID: checkoutProduct.id, sku, size: ['S', 'M', 'L', 'XL', 'ONE'][i - 1], color: 'Black', price: 10, stockQuantity: 1_000_000_000 },
      select: { id: true },
    });
    checkoutVariantIds.push(v.id);
  }
  console.log(`[seed:orders]   checkout product ${checkoutProduct.id} (${checkoutVariantIds.length} variants @ 1e9 stock)`);

  // ---- 3. Historical orders ------------------------------------------------
  const existing = await prisma.order.count();
  if (existing >= N_ORDERS) {
    console.log(`[seed:orders]   ${existing} orders already present (>= ${N_ORDERS}) — skipping order generation`);
  } else {
    const toMake = N_ORDERS - existing;
    // Pull a working set of real variants to reference on order lines.
    const variants = await prisma.productVariant.findMany({
      where: { sku: { not: { startsWith: LOAD_CHECKOUT_SKU } } },
      select: {
        id: true, sku: true, size: true, color: true, price: true,
        product: { select: { nameEn: true, sku: true, price: true, images: { select: { url: true }, take: 1 } } },
      },
      take: 4000,
    });
    if (variants.length === 0) throw new Error('No variants — run `npm run seed:large` first.');

    const startSeq = existing + 1;
    let made = 0;
    const BATCH = 100;
    for (let b = 0; b < toMake; b += BATCH) {
      const ops = [];
      for (let k = 0; k < BATCH && b + k < toMake; k++) {
        const seq = startSeq + b + k;
        const daysAgo = Math.random() * DAYS_BACK;
        const created = new Date(Date.now() - daysAgo * 86400_000);
        const status = pickStatus(Math.random());
        const nLines = 1 + rnd(4);
        const lines = [];
        let subtotal = 0;
        for (let l = 0; l < nLines; l++) {
          const v = variants[rnd(variants.length)];
          const qty = 1 + rnd(3);
          const unit = Number(v.price ?? v.product.price);
          subtotal += unit * qty;
          lines.push({
            variantID: v.id,
            productName: v.product.nameEn, productSKU: v.product.sku, variantSKU: v.sku,
            productImageUrl: v.product.images[0]?.url ?? null,
            size: v.size, color: v.color, quantity: qty,
            unitPrice: money(unit), lineTotal: money(unit * qty),
          });
        }
        const deliveryFee = status === 'CANCELLED' ? 0 : 3;
        const custId = Math.random() < 0.75 ? customerIds[rnd(customerIds.length)] : null;
        ops.push(prisma.order.create({
          data: {
            orderNumber: `LT${String(seq).padStart(8, '0')}`,
            userID: custId,
            guestEmail: custId ? null : `guest+${seq}@${LOAD_CUSTOMER_DOMAIN}`,
            ipAddress: `10.${rnd(255)}.${rnd(255)}.${rnd(255)}`,
            deliveryName: `Recipient ${seq}`, deliveryPhone: `+9613${String(200000 + seq).slice(-6)}`,
            deliveryAddress: `${1 + rnd(200)} Test St`, deliveryCity: 'Beirut',
            deliveryRegion: REGIONS[rnd(REGIONS.length)],
            subtotal: money(subtotal), discountAmount: 0, deliveryFee,
            total: money(subtotal + deliveryFee),
            paymentMethod: 'COD',
            paymentStatus: status === 'DELIVERED' ? 'COLLECTED' : 'PENDING',
            status,
            dateCreated: created, lastEdit: created,
            items: { create: lines },
          },
        }));
      }
      await prisma.$transaction(ops);
      made += ops.length;
      if (made % 500 === 0 || made === toMake) console.log(`[seed:orders]   orders ${made}/${toMake}`);
    }
  }

  const totals = {
    customers: await prisma.user.count({ where: { email: { endsWith: `@${LOAD_CUSTOMER_DOMAIN}` } } }),
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
    checkoutProductId: checkoutProduct.id,
    checkoutVariantIds,
    customerPassword: LOAD_CUSTOMER_PASSWORD,
    customerEmailPattern: `loadcust+<1..${N_CUSTOMERS}>@${LOAD_CUSTOMER_DOMAIN}`,
  };
  console.log('[seed:orders] manifest ' + JSON.stringify(totals));
  console.log('[seed:orders] done');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
