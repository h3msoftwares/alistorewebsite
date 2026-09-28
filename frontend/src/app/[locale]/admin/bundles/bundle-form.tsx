'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { useProduct, useProducts } from '@/hooks/use-catalog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useSaveBundle } from '@/hooks/use-bundles';
import { usePermissions } from '@/lib/rbac';
import { formatCurrency } from '@/lib/format';
import type { Bundle, BundleBody, Product } from '@/lib/types';
import { fromLocalInput, toLocalInput } from '../discounts/datetime-local';

type RecipeRow = { productID: string; variantID: string; quantity: number; price: number };
const blankRow = (): RecipeRow => ({ productID: '', variantID: '', quantity: 1, price: 0 });

function ComponentRow({ row, products, onChange, onRemove, canRemove, busy, locale }: {
  row: RecipeRow; products: Product[]; onChange: (next: RecipeRow) => void; onRemove: () => void;
  canRemove: boolean; busy: boolean; locale: 'en' | 'ar';
}) {
  const t = (en: string, ar: string) => locale === 'ar' ? ar : en;
  const product = useProduct(row.productID || undefined);
  const selected = product.data ?? products.find((p) => p.id === row.productID);
  return <div className="admin-form__row">
    <Field label={t('Product', 'المنتج')} required>{(p) => <Select {...p} value={row.productID} disabled={busy} required onChange={(e) => onChange({ ...row, productID: e.target.value, variantID: '', price: 0 })}>
      <option value="">{t('Select a product', 'اختر منتجاً')}</option>
      {selected && !products.some((p) => p.id === selected.id) && <option value={selected.id}>{locale === 'ar' ? selected.nameAr : selected.nameEn}</option>}
      {products.map((product) => <option key={product.id} value={product.id} disabled={!product.isActive || Boolean(product.deletedAt)}>{locale === 'ar' ? product.nameAr : product.nameEn} ({product.sku})</option>)}
    </Select>}</Field>
    <Field label={t('Exact variant / SKU', 'الصنف المحدد / الرمز')} required>{(p) => <Select {...p} value={row.variantID} disabled={busy || !selected} required onChange={(e) => {
      const variant = selected?.variants?.find((v) => v.id === e.target.value);
      onChange({ ...row, variantID: e.target.value, price: Number(variant?.price ?? selected?.price ?? 0) });
    }}>
      <option value="">{t('Select a variant', 'اختر صنفاً')}</option>
      {selected?.variants?.map((v) => <option key={v.id} value={v.id}>{[v.sku, v.size, v.color].filter(Boolean).join(' — ')}</option>)}
    </Select>}</Field>
    <Field label={t('Required quantity', 'الكمية المطلوبة')} required>{(p) => <Input {...p} type="number" min={1} max={999} step={1} value={row.quantity || ''} required disabled={busy} onChange={(e) => onChange({ ...row, quantity: Number(e.target.value) })} />}</Field>
    {row.variantID && <p>{t('Component total (regular price)', 'إجمالي المكوّن (السعر العادي)')}: {formatCurrency(Math.round(row.price * 100) * row.quantity / 100, locale)}</p>}
    <Button type="button" variant="ghost" disabled={busy || !canRemove} onClick={onRemove}>{t('Remove component', 'حذف مكوّن')}</Button>
  </div>;
}

export function BundleForm({ locale, initial }: { locale: 'en' | 'ar'; initial?: Bundle }) {
  const t = (en: string, ar: string) => locale === 'ar' ? ar : en;
  const canManage = usePermissions().has('bundles:manage');
  const router = useRouter();
  const save = useSaveBundle(initial?.id);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 300);
  const products = useProducts({ status: 'all', pageSize: 60, search: debounced || undefined }, { keepPreviousData: false });
  const [nameEn, setNameEn] = useState(initial?.nameEn ?? '');
  const [nameAr, setNameAr] = useState(initial?.nameAr ?? '');
  const [status, setStatus] = useState<BundleBody['status']>(initial?.status ?? 'DRAFT');
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt ?? null));
  const [price, setPrice] = useState(Number(initial?.price ?? 0));
  const [rows, setRows] = useState<RecipeRow[]>(initial?.components.map((c) => ({ productID: c.variant.product.id, variantID: c.variantID, quantity: c.quantity, price: Number(c.variant.price ?? c.variant.product.price) })) ?? [blankRow(), blankRow()]);
  const separate = rows.reduce((sum, row) => sum + Math.round(row.price * 100) * row.quantity, 0) / 100;
  const incomplete = separate - Math.min(...rows.map((row) => row.price));
  const complete = rows.every((row) => row.variantID && row.quantity > 0 && row.price > 0);
  if (!canManage) return <Alert>{t('Bundle management permission is required.', 'تحتاج إلى صلاحية إدارة الباقات.')}</Alert>;
  const busy = save.isPending;
  return <form className="admin-form" onSubmit={async (event) => {
    event.preventDefault(); setError(null);
    if (new Set(rows.map((row) => row.variantID)).size !== rows.length) { setError(t('Select each SKU once.', 'اختر كل رمز صنف مرة واحدة.')); return; }
    try {
      await save.mutateAsync({ nameEn, nameAr, status, price, startsAt: fromLocalInput(startsAt), endsAt: fromLocalInput(endsAt), components: rows.map(({ variantID, quantity }) => ({ variantID, quantity })) });
      router.push(`/${locale}/admin/bundles`);
    } catch (e) { setError(e instanceof Error ? e.message : t('Could not save Bundle.', 'تعذّر حفظ الباقة.')); }
  }}>
    <div className="admin-form__row">
      <Field label={t('Name (English)', 'الاسم (إنجليزي)')} required>{(p) => <Input {...p} value={nameEn} onChange={(e) => setNameEn(e.target.value)} required maxLength={120} disabled={busy} />}</Field>
      <Field label={t('Name (Arabic)', 'الاسم (عربي)')} required>{(p) => <Input {...p} value={nameAr} onChange={(e) => setNameAr(e.target.value)} required maxLength={120} dir="rtl" disabled={busy} />}</Field>
      <Field label={t('Status', 'الحالة')}>{(p) => <Select {...p} value={status} onChange={(e) => setStatus(e.target.value as BundleBody['status'])} disabled={busy}>
        <option value="DRAFT">{t('Draft', 'مسودة')}</option><option value="ACTIVE">{t('Active', 'نشط')}</option><option value="PAUSED">{t('Paused', 'متوقف')}</option><option value="ENDED">{t('Ended', 'منتهٍ')}</option>
      </Select>}</Field>
    </div>
    <div className="admin-form__row">
      <Field label={t('Starts', 'يبدأ')}>{(p) => <Input {...p} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} disabled={busy} />}</Field>
      <Field label={t('Ends', 'ينتهي')}>{(p) => <Input {...p} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} disabled={busy} />}</Field>
    </div>
    <Input aria-label={t('Search products', 'بحث المنتجات')} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search products…', 'ابحث عن منتج…')} disabled={busy} />
    {rows.map((row, index) => <ComponentRow key={index} row={row} products={products.data?.items ?? []} locale={locale} busy={busy} canRemove={rows.length > 2}
      onChange={(next) => setRows((current) => current.map((r, i) => i === index ? next : r))} onRemove={() => setRows((current) => current.filter((_, i) => i !== index))} />)}
    {rows.length < 20 && <Button type="button" variant="outline" disabled={busy} onClick={() => setRows([...rows, blankRow()])}>{t('Add component', 'إضافة مكوّن')}</Button>}
    <Field label={t('Bundle price ($)', 'سعر الباقة ($)')} required>{(p) => <Input {...p} type="number" min={0.01} max={1_000_000} step="0.01" value={price || ''} onChange={(e) => setPrice(Number(e.target.value))} required disabled={busy} />}</Field>
    {complete && <div className="stack">
      <p>{t('Separate total (regular prices)', 'الإجمالي منفرداً (الأسعار العادية)')}: {formatCurrency(separate, locale)}</p>
      <p>{t('Bundle savings', 'توفير الباقة')}: {formatCurrency(separate - price, locale)}</p>
      <p className={price <= incomplete || price >= separate ? 'form-error' : 'admin-form__hint'}>{t(`Price must be above $${incomplete.toFixed(2)} and below $${separate.toFixed(2)}.`, `يجب أن يتجاوز السعر $${incomplete.toFixed(2)} وأن يقل عن $${separate.toFixed(2)}.`)}</p>
    </div>}
    <p className="admin-form__hint">{t('Saving also checks current sale/promotion prices and scheduled SKU conflicts. Bundle returns are not available yet.', 'يفحص الحفظ أيضاً أسعار التخفيضات والعروض الحالية وتعارض مواعيد الأصناف. إرجاع الباقات غير متاح حالياً.')}</p>
    {error && <Alert tone="danger">{error}</Alert>}
    <div className="admin-form__actions"><Button type="submit" loading={busy}>{initial ? t('Save Bundle', 'حفظ الباقة') : t('Add Bundle', 'إضافة باقة')}</Button><Link className="btn btn--ghost" href={`/${locale}/admin/bundles`}>{t('Cancel', 'إلغاء')}</Link></div>
  </form>;
}
