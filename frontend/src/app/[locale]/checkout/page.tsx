import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: checkout form -> POST /api/orders/checkout (COD only, no payment
// fields). Body is the delivery snapshot: deliveryName, deliveryPhone,
// deliveryAddress, deliveryCity, deliveryArea?, deliveryNotes?, notes?,
// plus guestEmail? for guests / addressId? to reference a saved address.
export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagePlaceholder title={locale === 'ar' ? 'إتمام الطلب' : 'Checkout'} />;
}
