import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: cart contents (GET /api/cart), quantity edit, remove, subtotal,
// proceed-to-checkout CTA. Works for both guests and logged-in users.
export default function CartPage({ params }: { params: { locale: string } }) {
  return <PagePlaceholder title={params.locale === 'ar' ? 'سلة التسوق' : 'Cart'} />;
}
