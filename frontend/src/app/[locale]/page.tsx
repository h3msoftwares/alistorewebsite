import Link from 'next/link';
import { STOREFRONT_COLLECTIONS } from '@/lib/collections';

/**
 * The "distinct doors" landing page discussed in the design brief — one door
 * per storefront collection (see lib/collections.ts).
 * TODO: replace the placeholder tiles with real hero imagery per door,
 * in Saxon's editorial-banner style. Structure only, for now — each tile
 * already carries data-collection so the compound accent system in
 * globals.css previews correctly.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isAr = locale === 'ar';
  return (
    <div className="container" style={{ paddingBlock: 'var(--space-7)' }}>
      <h1>{isAr ? "متجر علي" : "Ali's Store"}</h1>
      <p>{isAr ? 'اختر القسم' : 'Choose a collection'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-5)' }}>
        {STOREFRONT_COLLECTIONS.map((c) => (
          <Link
            key={c.slug}
            href={`/${locale}/${c.slug}`}
            className="card"
            data-collection={c.slug}
            style={{ padding: 'var(--space-6)', textAlign: 'center' }}
          >
            <h2 style={{ color: 'var(--collection-accent)' }}>{isAr ? c.nameAr : c.nameEn}</h2>
          </Link>
        ))}
      </div>
    </div>
  );
}
