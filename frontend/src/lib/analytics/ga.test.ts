import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  productToGaItem,
  cartItemToGaItem,
  trackViewItem,
  trackAddToCart,
  trackPurchase,
} from './ga';
import type { CartItem, Product, ProductVariant } from '@/lib/types';

const product = {
  sku: 'TEE-BLK',
  nameEn: 'Oversized Tee',
  price: 30,
  effectivePrice: 24,
  category: { nameEn: 'T-Shirts' },
} as Pick<Product, 'sku' | 'nameEn' | 'price' | 'effectivePrice'> & {
  category: { nameEn: string };
};

const variant = { size: 'M', color: 'Black', price: 26 } as Pick<
  ProductVariant,
  'size' | 'color' | 'price'
>;

describe('productToGaItem', () => {
  it('uses the SKU as item_id and prefers the variant price', () => {
    expect(productToGaItem(product, variant, 2)).toEqual({
      item_id: 'TEE-BLK',
      item_name: 'Oversized Tee',
      price: 26,
      item_category: 'T-Shirts',
      item_variant: 'M / Black',
      quantity: 2,
    });
  });

  it('falls back to the product effective price and omits an empty variant label', () => {
    expect(productToGaItem(product)).toMatchObject({ price: 24, item_variant: undefined });
  });
});

describe('cartItemToGaItem', () => {
  it('maps a cart line through productToGaItem', () => {
    const line = {
      quantity: 3,
      variant: { size: 'L', color: null, price: null, product },
    } as unknown as CartItem;
    expect(cartItemToGaItem(line)).toMatchObject({
      item_id: 'TEE-BLK',
      price: 24,
      item_variant: 'L',
      quantity: 3,
    });
  });
});

describe('trackers', () => {
  afterEach(() => {
    delete (window as { gtag?: unknown }).gtag;
    vi.unstubAllEnvs();
  });

  it('no-op when gtag is not on window', () => {
    vi.stubEnv('NEXT_PUBLIC_GA4_MEASUREMENT_ID', 'G-TEST');
    expect(() => trackViewItem(productToGaItem(product))).not.toThrow();
  });

  describe('with gtag present', () => {
    let gtag: ReturnType<typeof vi.fn>;
    beforeEach(() => {
      vi.stubEnv('NEXT_PUBLIC_GA4_MEASUREMENT_ID', 'G-TEST');
      gtag = vi.fn();
      (window as { gtag?: unknown }).gtag = gtag;
    });

    it('emits add_to_cart with currency, line value and the item', () => {
      trackAddToCart(productToGaItem(product, variant, 2));
      expect(gtag).toHaveBeenCalledWith('event', 'add_to_cart', {
        currency: 'USD',
        value: 52,
        items: [expect.objectContaining({ item_id: 'TEE-BLK', quantity: 2 })],
      });
    });

    it('emits purchase with the transaction id', () => {
      trackPurchase({ transactionId: 'AS-1', value: 52, items: [productToGaItem(product, variant, 2)] });
      expect(gtag).toHaveBeenCalledWith(
        'event',
        'purchase',
        expect.objectContaining({ transaction_id: 'AS-1', currency: 'USD', value: 52 })
      );
    });
  });
});
