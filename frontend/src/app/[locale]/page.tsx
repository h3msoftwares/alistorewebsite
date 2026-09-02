import Link from 'next/link';

const DOORS = [
  { slug: 'women', labelEn: 'Women', labelAr: 'حريمي', department: 'women' as const },
  { slug: 'men', labelEn: 'Men', labelAr: 'رجالي', department: 'men' as const },
  { slug: 'kids', labelEn: 'Kids', labelAr: 'أطفال', department: 'kids' as const },
];

/**
 * The "distinct doors" landing page discussed in the design brief.
 * TODO: replace the placeholder tiles with real hero imagery per door,
 * in Saxon's editorial-banner style. Structure only, for now — each tile
 * already carries data-department so the compound accent system in
 * globals.css previews correctly.
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isAr = locale === 'ar';
  return (
    <div className="container" style={{ paddingBlock: 'var(--space-7)' }}>
      <h1>{isAr ? "متجر علي" : "Ali's Store"}</h1>
      <p>{isAr ? 'اختر القسم' : 'Choose a department'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-5)' }}>
        {DOORS.map((d) => (
          <Link
            key={d.slug}
            href={`/${locale}/${d.slug}`}
            className="card"
            data-department={d.department}
            style={{ padding: 'var(--space-6)', textAlign: 'center' }}
          >
            <h2 style={{ color: 'var(--dept-accent)' }}>{isAr ? d.labelAr : d.labelEn}</h2>
          </Link>
        ))}
      </div>
    </div>
  );
}
