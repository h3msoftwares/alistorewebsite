'use client';
import { useParams } from 'next/navigation';
import { BundleForm } from '../bundle-form';
export default function NewBundlePage() {
  const params = useParams();
  const locale = params?.locale === 'ar' ? 'ar' : 'en';
  return <div className="section--tight"><h1>{locale === 'ar' ? 'باقة جديدة' : 'New Bundle'}</h1><BundleForm locale={locale} /></div>;
}
