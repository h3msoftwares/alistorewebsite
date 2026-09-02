import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: order history list (GET /api/orders/mine) — requires login.
export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagePlaceholder title={locale === 'ar' ? 'طلباتي' : 'My Orders'} />;
}
