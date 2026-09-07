import type { Metadata } from 'next';
import { DeliveryReturnsView } from './delivery-returns-view';

export const metadata: Metadata = {
  title: 'Delivery & Returns',
  description: 'How delivery, returns, exchanges, and refunds work at Ali’s Store.',
};

export default async function DeliveryReturnsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = (await params) as { locale: 'en' | 'ar' };
  return <DeliveryReturnsView locale={locale === 'ar' ? 'ar' : 'en'} />;
}
