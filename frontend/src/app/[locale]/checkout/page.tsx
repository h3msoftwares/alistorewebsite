import { CheckoutView } from './checkout-view';

// COD checkout: delivery snapshot + governorate (drives the admin-set delivery
// fee) -> POST /api/orders/checkout. Server shell only; the client component
// owns the cart read, the live delivery-fee quote, and the mutation.
export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  return <CheckoutView locale={locale === 'ar' ? 'ar' : 'en'} />;
}
