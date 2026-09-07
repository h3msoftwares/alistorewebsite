import { OrderTrackView } from './order-track-view';

export default async function OrderTrackPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = (await params) as { locale: 'en' | 'ar'; token: string };
  return <OrderTrackView locale={locale} token={token} />;
}
