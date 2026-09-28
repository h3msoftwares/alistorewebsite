'use client';
import { useParams } from 'next/navigation';
import { useBundle } from '@/hooks/use-bundles';
import { Alert, ProductGridSkeleton } from '@/components/ui';
import { BundleForm } from '../bundle-form';
export default function EditBundlePage() {
  const params = useParams();
  const locale = params?.locale === 'ar' ? 'ar' : 'en';
  const bundle = useBundle(typeof params?.id === 'string' ? params.id : '');
  if (bundle.isPending) return <ProductGridSkeleton count={1} />;
  if (!bundle.data) return <Alert tone="danger">{locale === 'ar' ? 'تعذّر تحميل الباقة.' : 'Could not load Bundle.'}</Alert>;
  return <div className="section--tight"><h1>{locale === 'ar' ? 'تعديل الباقة' : 'Edit Bundle'}</h1><BundleForm key={bundle.data.id} locale={locale} initial={bundle.data} /></div>;
}
