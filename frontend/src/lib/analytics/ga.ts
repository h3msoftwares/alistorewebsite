/**
 * Google Analytics 4 (gtag.js) client helpers.
 *
 * `<GoogleAnalytics>` (components/analytics/google-analytics.tsx) loads gtag.js
 * and configures the property; everything here is a thin, guarded wrapper
 * around `window.gtag` so callers never have to null-check it. Every function
 * no-ops when GA is not configured (no `NEXT_PUBLIC_GA4_MEASUREMENT_ID`) or
 * before gtag.js has finished loading.
 *
 * Events use GA4 recommended names and the `items` array shape so GA4's
 * built-in e-commerce and funnel reports work without custom definitions.
 * `item_id` is the product SKU on every funnel step (view → cart → purchase)
 * so item-scoped funnels line up — `OrderItem` only snapshots the SKU, not the
 * product id.
 */

import type { CartItem, Product, ProductVariant } from '@/lib/types';

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ?? '';

/** Storefront prices are USD (`Order.currency` defaults to "USD"). */
const CURRENCY = 'USD';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function gtagReady(): boolean {
  // Read the env expression directly (not the frozen module const) so tests can
  // toggle it — Next still inlines `process.env.NEXT_PUBLIC_*` at build time.
  return (
    Boolean(process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID) &&
    typeof window !== 'undefined' &&
    typeof window.gtag === 'function'
  );
}

function emit(name: string, params: Record<string, unknown>): void {
  if (!gtagReady()) return;
  window.gtag!('event', name, params);
}

/** Manual SPA page_view — gtag is configured with `send_page_view: false`, so
 *  App Router client navigations are reported from here. */
export function trackPageView(path: string): void {
  if (!gtagReady()) return;
  window.gtag!('event', 'page_view', {
    page_path: path,
    page_location: window.location.origin + path,
    page_title: document.title,
  });
}

export interface GaItem {
  item_id: string;
  item_name?: string;
  price?: number;
  item_category?: string;
  item_variant?: string;
  quantity?: number;
}

export function productToGaItem(
  product: Pick<Product, 'sku' | 'nameEn' | 'price' | 'effectivePrice'> & {
    category?: { nameEn: string } | null;
  },
  variant?: Pick<ProductVariant, 'size' | 'color' | 'price'> | null,
  quantity?: number
): GaItem {
  const raw = Number(variant?.price ?? product.effectivePrice ?? product.price);
  const variantLabel = [variant?.size, variant?.color].filter(Boolean).join(' / ');
  return {
    item_id: product.sku,
    item_name: product.nameEn,
    price: Number.isFinite(raw) ? raw : undefined,
    item_category: product.category?.nameEn ?? undefined,
    item_variant: variantLabel || undefined,
    quantity,
  };
}

export function cartItemToGaItem(line: CartItem): GaItem {
  return productToGaItem(line.variant.product, line.variant, line.quantity);
}

const lineValue = (item: GaItem) => (item.price ?? 0) * (item.quantity ?? 1);

export function trackViewItem(item: GaItem): void {
  emit('view_item', { currency: CURRENCY, value: item.price ?? 0, items: [item] });
}

export function trackAddToCart(item: GaItem): void {
  emit('add_to_cart', { currency: CURRENCY, value: lineValue(item), items: [item] });
}

export function trackRemoveFromCart(item: GaItem): void {
  emit('remove_from_cart', { currency: CURRENCY, value: lineValue(item), items: [item] });
}

/** Only the product id is available at the toggle call site — good enough for
 *  a wishlist signal (not part of the purchase funnel). */
export function trackAddToWishlist(productId: string): void {
  emit('add_to_wishlist', { currency: CURRENCY, items: [{ item_id: productId }] });
}

export function trackPurchase(input: {
  transactionId: string;
  value: number;
  items: GaItem[];
}): void {
  emit('purchase', {
    transaction_id: input.transactionId,
    currency: CURRENCY,
    value: input.value,
    items: input.items,
  });
}

// TODO: wire when the checkout UI is built (app/[locale]/checkout/page.tsx is a
// placeholder) — trackBeginCheckout on entry, plus add_shipping_info /
// add_payment_info per step.
export function trackBeginCheckout(input: { value: number; items: GaItem[] }): void {
  emit('begin_checkout', { currency: CURRENCY, value: input.value, items: input.items });
}

// TODO: wire when the search overlay is implemented
// (components/chrome/search-overlay.tsx is a stub).
export function trackSearch(term: string): void {
  emit('search', { search_term: term });
}
