import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: order history list (GET /api/orders/mine) — requires login.
export default function OrdersPage({ params }: { params: { locale: string } }) {
  return <PagePlaceholder title={params.locale === 'ar' ? 'طلباتي' : 'My Orders'} />;
}
