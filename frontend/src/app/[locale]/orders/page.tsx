import { OrdersView } from './orders-view';

export default async function OrdersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  return <OrdersView locale={locale} />;
}
