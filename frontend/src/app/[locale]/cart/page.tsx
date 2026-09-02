import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: cart contents (GET /api/cart), quantity edit, remove, subtotal,
// proceed-to-checkout CTA. Works for both guests and logged-in users.
export default async function CartPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <PagePlaceholder title={locale === 'ar' ? 'سلة التسوق' : 'Cart'} />;
}
