import { PagePlaceholder } from '@/components/page-placeholder';

// TODO: product create form — bilingual name/description fields (EN/AR),
// collection + category picker, price, compareAtPrice, quantity (may be 0 or
// negative), optional sale (saleType PERCENT|AMOUNT + saleValue), and
// size/color variant rows (size/color optional per variant). POST /api/products.
export default function NewProductPage() {
  return <PagePlaceholder title="New Product" />;
}
