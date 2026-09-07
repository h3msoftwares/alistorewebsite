import { OrderDetailView } from './order-detail-view';

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = (await params) as { locale: 'en' | 'ar'; id: string };
  return <OrderDetailView locale={locale} id={id} />;
}
