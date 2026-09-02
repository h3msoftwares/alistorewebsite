import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PriceTag } from '@/components/ui/price-tag';
import { ProductCard, type ProductCardData } from '@/components/ui/product-card';

// Dev-only visual showcase for the T2 UI primitives — lets the team verify
// Button/Input/PriceTag/ProductCard render correctly (both themes, both
// locales/directions) before any real page consumes them. Uses inline mock
// data (including ImageKit's public demo images) since there's no live API
// wiring yet. Delete this route once Week 2's department listing pages
// (women/men/kids) import ProductCard for real.
const MOCK_PRODUCTS: Record<'women' | 'men' | 'kids', ProductCardData> = {
  women: {
    id: 'mock-women-1',
    nameEn: 'Silk Robe',
    nameAr: 'روب حرير',
    price: 49.99,
    compareAtPrice: 69.99,
    images: [{ url: 'https://ik.imagekit.io/demo/img/image4.jpeg', altEn: 'Silk robe', altAr: 'روب حرير' }],
  },
  men: {
    id: 'mock-men-1',
    nameEn: 'Tailored Blazer',
    nameAr: 'بليزر مفصل',
    price: 89.0,
    images: [{ url: 'https://ik.imagekit.io/demo/img/image2.jpeg', altEn: 'Tailored blazer', altAr: 'بليزر مفصل' }],
  },
  kids: {
    id: 'mock-kids-1',
    nameEn: 'Playful Hoodie',
    nameAr: 'هودي مرح',
    price: 24.5,
    compareAtPrice: 32.0,
    images: [{ url: 'https://ik.imagekit.io/demo/img/image3.jpeg', altEn: 'Playful hoodie', altAr: 'هودي مرح' }],
  },
};

export default async function UiShowcasePage({ params }: { params: Promise<{ locale: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { locale } = (await params) as { locale: 'en' | 'ar' };

  return (
    <div className="container" style={{ paddingBlock: 'var(--space-7)' }}>
      <h1>UI Primitives Showcase (dev only)</h1>

      <section style={{ marginBlockEnd: 'var(--space-7)' }}>
        <h2>Buttons</h2>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <Button variant="primary">Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="accent">Accent</Button>
        </div>
      </section>

      <section style={{ marginBlockEnd: 'var(--space-7)' }}>
        <h2>Input</h2>
        <Input placeholder={locale === 'ar' ? 'اكتب هنا...' : 'Type here...'} style={{ maxWidth: 320 }} />
      </section>

      <section style={{ marginBlockEnd: 'var(--space-7)' }}>
        <h2>PriceTag</h2>
        <div style={{ display: 'flex', gap: 'var(--space-5)', alignItems: 'center' }}>
          <PriceTag price={39.99} locale={locale} />
          <PriceTag price={39.99} compareAtPrice={59.99} locale={locale} />
        </div>
      </section>

      <section>
        <h2>ProductCard (one per department)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-5)' }}>
          {(['women', 'men', 'kids'] as const).map((dept) => (
            <ProductCard key={dept} product={MOCK_PRODUCTS[dept]} locale={locale} department={dept} />
          ))}
        </div>
      </section>
    </div>
  );
}
