import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: checkout form (name, phone, delivery address text, notes) ->
// POST /api/orders/checkout. COD only — no payment fields.
export default async function CheckoutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagePlaceholder title={locale === 'ar' ? 'إتمام الطلب' : 'Checkout'} />;
}
