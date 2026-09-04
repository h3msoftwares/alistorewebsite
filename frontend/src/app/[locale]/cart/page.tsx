import { CartView } from './cart-view';

// Cart contents (GET /api/cart via useCart) — quantity edit, remove, subtotal,
// proceed-to-checkout. Works for both guests (cookie-scoped cart) and
// logged-in users; the data layer in hooks/use-cart.ts handles that split, so
// this page stays owner-agnostic. Server shell mirrors app/[locale]/dev/ui.
export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  return <CartView locale={locale} />;
}
