'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert, Button, ConfirmModal, DataTable, EmptyState, ProductGridSkeleton } from '@/components/ui';
import { useBundles, useDeleteBundle } from '@/hooks/use-bundles';
import { usePermissions } from '@/lib/rbac';
import { formatCurrency } from '@/lib/format';
import type { Bundle } from '@/lib/types';

export default function BundlesPage() {
  const params = useParams();
  const locale = params?.locale === 'ar' ? 'ar' : 'en';
  const t = (en: string, ar: string) => locale === 'ar' ? ar : en;
  const query = useBundles();
  const remove = useDeleteBundle();
  const canManage = usePermissions().has('bundles:manage');
  const [selected, setSelected] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const statuses = { DRAFT: t('Draft', 'مسودة'), ACTIVE: t('Active', 'نشط'), PAUSED: t('Paused', 'متوقف'), ENDED: t('Ended', 'منتهٍ') };
  return <div className="section--tight">
    <div className="admin-page__head"><h1>{t('Bundle', 'باقة')}</h1>{canManage && <Link className="btn btn--primary" href={`/${locale}/admin/bundles/new`}>{t('New Bundle', 'باقة جديدة')}</Link>}</div>
    {error && <Alert tone="danger">{error}</Alert>}
    {query.isPending ? <ProductGridSkeleton count={2} /> : query.isError ? <EmptyState tone="alert" title={t('Could not load Bundles.', 'تعذّر تحميل الباقات.')} action={<Button onClick={() => void query.refetch()}>{t('Retry', 'إعادة المحاولة')}</Button>} /> : !query.data?.length ? <EmptyState title={t('No Bundles yet.', 'لا توجد باقات بعد.')} /> : <DataTable responsive>
      <thead><tr><th>{t('Name', 'الاسم')}</th><th>{t('Recipe', 'المكوّنات')}</th><th>{t('Bundle price', 'سعر الباقة')}</th><th>{t('Status', 'الحالة')}</th><th>{t('Actions', 'الإجراءات')}</th></tr></thead>
      <tbody>{query.data.map((bundle) => <tr key={bundle.id}>
        <td data-label={t('Name', 'الاسم')}>{locale === 'ar' ? bundle.nameAr : bundle.nameEn}</td>
        <td data-label={t('Recipe', 'المكوّنات')}>{bundle.components.map((c) => `${c.quantity} × ${locale === 'ar' ? c.variant.product.nameAr : c.variant.product.nameEn} (${c.variant.sku})`).join(' + ')}</td>
        <td data-label={t('Bundle price', 'سعر الباقة')}>{formatCurrency(Number(bundle.price), locale)}</td><td data-label={t('Status', 'الحالة')}>{statuses[bundle.status]}</td>
        <td data-label={t('Actions', 'الإجراءات')}>{canManage && <><Link className="btn btn--ghost btn--sm" href={`/${locale}/admin/bundles/${bundle.id}`}>{t('Edit', 'تعديل')}</Link><Button size="sm" variant="ghost" onClick={() => setSelected(bundle)}>{t('Delete', 'حذف')}</Button></>}</td>
      </tr>)}</tbody>
    </DataTable>}
    <ConfirmModal open={Boolean(selected)} onClose={() => setSelected(null)} title={t('Delete this Bundle?', 'حذف هذه الباقة؟')} body={t('Past purchases remain unchanged.', 'تبقى المشتريات السابقة دون تغيير.')} confirmLabel={t('Delete', 'حذف')} cancelLabel={t('Cancel', 'إلغاء')} loading={remove.isPending} tone="danger" onConfirm={() => {
      if (!selected) return;
      remove.mutate(selected.id, { onSuccess: () => setSelected(null), onError: (e) => setError(e.message) });
    }} />
  </div>;
}
