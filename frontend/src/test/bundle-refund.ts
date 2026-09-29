import type { BundleRefundCalculation } from '@/lib/types';

export const bundleRefundCalculation: BundleRefundCalculation = {
  version: 1, method: 'BUNDLE_KEPT_QUANTITY', orderBundleID: 'group', nameEn: 'A and B', nameAr: 'باقة أ وب',
  instanceCount: 1, flatPriceCents: 8000, originalNetCents: 8000,
  components: [{ orderItemID: 'a', productName: 'A', quantity: 2, requiredQuantity: 2, individualPriceCents: 3000 },
    { orderItemID: 'b', productName: 'B', quantity: 1, requiredQuantity: 1, individualPriceCents: 4000 }],
  beforeKeptQuantities: { a: 2, b: 1 }, keptQuantities: { a: 1, b: 1 },
  beforeInstanceCount: 1, keptInstanceCount: 0, keptNetCents: 7000, lostDiscountCents: 2000,
  cumulativeRefundCents: 1000, previousRefundCents: 0, refundCents: 1000,
  allocations: [{ orderItemID: 'a', quantity: 1, refundCents: 1000 }],
};
