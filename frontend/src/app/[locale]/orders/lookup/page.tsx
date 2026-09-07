import { OrderLookupView } from './order-lookup-view';

export default async function OrderLookupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  return <OrderLookupView locale={locale} />;
}
