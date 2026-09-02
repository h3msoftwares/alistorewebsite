import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: checkout form (name, phone, delivery address text, notes) ->
// POST /api/orders/checkout. COD only — no payment fields.
export default function CheckoutPage({ params }: { params: { locale: string } }) {
  return <PagePlaceholder title={params.locale === 'ar' ? 'إتمام الطلب' : 'Checkout'} />;
}
