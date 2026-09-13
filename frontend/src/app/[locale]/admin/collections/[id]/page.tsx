'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Archive, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Alert, Button, CheckList, Choice, EmptyState, Field, Icon, Input, ProductGridSkeleton, Select } from '@/components/ui';
import { ImageGallery } from '@/components/admin/image-gallery';
import {
  useAddCollectionImage,
  useAdminCategories,
  useCollection,
  useCollectionProducts,
  useDeleteCollection,
  useDeleteCollectionImage,
  usePermanentDeleteCollection,
  useProducts,
  useRestoreCollection,
  useSetCollectionProducts,
  useSetCollectionRules,
  useUpdateCollection,
} from '@/hooks/use-catalog';
import { buildCategoryPaths } from '@/lib/category-path';
import type { Collection, CollectionRule, CollectionRuleField, CollectionRuleOperator } from '@/lib/types';
import { CollectionForm, type CollectionFormValues } from '../collection-form';

/** Manual product membership — search the catalog and add/remove products;
 *  every change replaces the whole membership set (same "replace-all on
 *  save" convention used elsewhere). The whole membership for MANUAL; an
 *  INCLUDE overlay on top of the rule-computed set for HYBRID (see
 *  CollectionRulesPanel below) — meaningless for AUTOMATED, so the parent
 *  page only renders this for the other two types. */
function CollectionProductsPanel({ id, locale }: { id: string; locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { data: linked, isPending } = useCollectionProducts(id);
  const setProducts = useSetCollectionProducts();
  const [search, setSearch] = useState('');
  const { data: results } = useProducts({ search, pageSize: 10 }, { enabled: search.trim().length >= 2 });

  const linkedIds = (linked ?? []).map((p) => p.id);
  const addProduct = (productId: string) => {
    if (linkedIds.includes(productId)) return;
    setProducts.mutate({ id, productIds: [...linkedIds, productId] });
  };
  const removeProduct = (productId: string) => {
    setProducts.mutate({ id, productIds: linkedIds.filter((pid) => pid !== productId) });
  };

  return (
    <div className="admin-form" style={{ marginTop: 'var(--space-7)' }}>
      <p className="admin-form__section-title">{t('Products', 'المنتجات')}</p>

      {isPending ? (
        <ProductGridSkeleton count={3} />
      ) : (linked ?? []).length === 0 ? (
        <p className="admin-form__hint">{t('No products in this collection yet.', 'لا توجد منتجات في هذه المجموعة بعد.')}</p>
      ) : (
        <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--space-2)' }}>
          {(linked ?? []).map((p) => (
            <li
              key={p.id}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', justifyContent: 'space-between' }}
            >
              <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
                <span>{isAr ? p.nameAr : p.nameEn}</span>
                <span style={{ color: 'var(--color-text-muted)' }}>{p.sku}</span>
              </span>
              <button
                type="button"
                className="icon-btn icon-btn--bordered"
                aria-label={t('Remove', 'إزالة')}
                title={t('Remove', 'إزالة')}
                onClick={() => removeProduct(p.id)}
                disabled={setProducts.isPending}
              >
                <Icon as={X} size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 'var(--space-4)' }}>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Search products to add…', 'ابحث عن منتجات لإضافتها…')}
        />
        {results && results.items.length > 0 && (
          <ul
            role="list"
            style={{ listStyle: 'none', padding: 0, margin: 'var(--space-2) 0 0', display: 'grid', gap: 'var(--space-2)' }}
          >
            {results.items
              .filter((p) => !linkedIds.includes(p.id))
              .map((p) => (
                <li
                  key={p.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', justifyContent: 'space-between' }}
                >
                  <span style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <span>{isAr ? p.nameAr : p.nameEn}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{p.sku}</span>
                  </span>
                  <Button type="button" variant="outline" size="sm" onClick={() => addProduct(p.id)} disabled={setProducts.isPending}>
                    {t('Add', 'إضافة')}
                  </Button>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Only the operators collection-rules.ts actually implements for each field —
// offering the rest would just be a guaranteed 400 (see that file's per-field
// switch). NOT_IN is in the schema's operator enum but no field implements
// it yet, so it's never offered here either.
const FIELD_OPERATORS: Record<CollectionRuleField, CollectionRuleOperator[]> = {
  PRODUCT_STATUS: ['EQUALS'],
  CATEGORY: ['IN'],
  PRICE: ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL'],
  COMPARE_AT_PRICE: ['EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL'],
  HAS_ACTIVE_PROMOTION: ['EXISTS'],
  CREATED_AT: ['EQUALS', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL'],
  STOCK_STATUS: ['EQUALS'],
};

function defaultValueForField(field: CollectionRuleField): unknown {
  switch (field) {
    case 'PRODUCT_STATUS':
      return 'ACTIVE';
    case 'STOCK_STATUS':
      return 'IN_STOCK';
    case 'CATEGORY':
      return { categoryIds: [], includeDescendants: true };
    case 'PRICE':
    case 'COMPARE_AT_PRICE':
      return 0;
    case 'CREATED_AT':
      return new Date().toISOString().slice(0, 10);
    case 'HAS_ACTIVE_PROMOTION':
      return undefined;
  }
}

type DraftRule = CollectionRule & { key: string };
let ruleKeySeq = 0;
const newRuleKey = () => `new-${(ruleKeySeq += 1)}`;

/** Editor for one rule's field-dependent value — a plain number for
 *  PRICE/COMPARE_AT_PRICE, an enum select for PRODUCT_STATUS/STOCK_STATUS, a
 *  date for CREATED_AT, a category multi-pick (+ include-descendants) for
 *  CATEGORY, and nothing at all for HAS_ACTIVE_PROMOTION (EXISTS needs no
 *  value) — matching collection-rules.ts's per-field value shape exactly. */
function RuleValueEditor({
  rule,
  onChange,
  busy,
  locale,
}: {
  rule: DraftRule;
  onChange: (value: unknown) => void;
  busy: boolean;
  locale: 'en' | 'ar';
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { data: categories } = useAdminCategories({ status: 'all' });
  const categoryPaths = useMemo(() => buildCategoryPaths(categories ?? [], isAr), [categories, isAr]);

  switch (rule.field) {
    case 'PRODUCT_STATUS':
      return (
        <Select value={String(rule.value ?? 'ACTIVE')} onChange={(e) => onChange(e.target.value)} disabled={busy}>
          <option value="ACTIVE">{t('Active', 'مُفعَّل')}</option>
          <option value="ARCHIVED">{t('Archived', 'مؤرشف')}</option>
        </Select>
      );
    case 'STOCK_STATUS':
      return (
        <Select value={String(rule.value ?? 'IN_STOCK')} onChange={(e) => onChange(e.target.value)} disabled={busy}>
          <option value="IN_STOCK">{t('In stock', 'متوفر')}</option>
          <option value="OUT_OF_STOCK">{t('Out of stock', 'غير متوفر')}</option>
        </Select>
      );
    case 'PRICE':
    case 'COMPARE_AT_PRICE':
      return (
        <Input
          type="number"
          min={0}
          step="0.01"
          value={typeof rule.value === 'number' ? rule.value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={busy}
        />
      );
    case 'CREATED_AT':
      return (
        <Input
          type="date"
          value={typeof rule.value === 'string' ? rule.value.slice(0, 10) : ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={busy}
        />
      );
    case 'HAS_ACTIVE_PROMOTION':
      return <p className="admin-form__hint">{t('No value needed', 'لا حاجة لقيمة')}</p>;
    case 'CATEGORY': {
      const obj = (rule.value ?? {}) as { categoryIds?: string[]; includeDescendants?: boolean };
      const categoryIds = obj.categoryIds ?? [];
      return (
        <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <CheckList
            value={categoryIds}
            onChange={(ids) => onChange({ ...obj, categoryIds: ids })}
            disabled={busy}
            emptyLabel={t('No categories yet', 'لا توجد فئات بعد')}
            items={(categories ?? []).map((c) => ({
              id: c.id,
              disabled: Boolean(c.isEffectivelyArchived),
              label: `${isAr ? c.nameAr : c.nameEn}${c.isEffectivelyArchived ? t(' (archived)', ' (مؤرشفة)') : ''}`,
              sublabel: categoryPaths.get(c.id) || undefined,
            }))}
          />
          <Choice
            type="checkbox"
            label={t('Include subcategories', 'شمول الفئات الفرعية')}
            checked={obj.includeDescendants ?? true}
            onChange={(e) => onChange({ ...obj, includeDescendants: e.target.checked })}
            disabled={busy}
          />
        </div>
      );
    }
  }
}

/** Rule editor for an AUTOMATED/HYBRID collection — a repeatable list of
 *  {groupNumber, field, operator, value} rows, replace-all-on-save like the
 *  products panel above. Rules sharing a groupNumber are ANDed; different
 *  group numbers are ORed (see collection-rules.ts). */
function CollectionRulesPanel({ id, locale, collection }: { id: string; locale: 'en' | 'ar'; collection: Collection }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const setRules = useSetCollectionRules();
  const [rules, setRulesState] = useState<DraftRule[]>(() =>
    (collection.rules ?? []).map((r) => ({ ...r, key: r.id ?? newRuleKey() }))
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const busy = setRules.isPending;

  const updateRule = (key: string, patch: Partial<DraftRule>) => {
    setSaved(false);
    setRulesState((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const removeRule = (key: string) => {
    setSaved(false);
    setRulesState((rs) => rs.filter((r) => r.key !== key));
  };
  const addRule = () => {
    setSaved(false);
    const nextGroup = rules.length ? Math.max(...rules.map((r) => r.groupNumber)) + 1 : 0;
    setRulesState((rs) => [
      ...rs,
      { key: newRuleKey(), groupNumber: nextGroup, field: 'PRICE', operator: 'GREATER_THAN_OR_EQUAL', value: 0 },
    ]);
  };

  const onSave = async () => {
    setError(null);
    setSaved(false);
    try {
      await setRules.mutateAsync({
        id,
        rules: rules.map(({ groupNumber, field, operator, value }) => ({ groupNumber, field, operator, value })),
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  return (
    <div className="admin-form" style={{ marginTop: 'var(--space-7)' }}>
      <p className="admin-form__section-title">{t('Rules', 'القواعد')}</p>
      <p className="admin-form__hint">
        {t(
          'Rules with the same group number are ANDed together; different group numbers are ORed.',
          'القواعد بنفس رقم المجموعة تُطبَّق معًا (و)؛ أرقام المجموعات المختلفة تُطبَّق كأي منها (أو).'
        )}
      </p>

      {rules.length === 0 ? (
        <p className="admin-form__hint">{t('No rules yet — this collection matches nothing.', 'لا توجد قواعد بعد — لن تطابق هذه المجموعة أي شيء.')}</p>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
          {rules.map((rule) => (
            <div
              key={rule.key}
              className="admin-form__row"
              style={{ alignItems: 'end', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)' }}
            >
              <Field label={t('Group', 'المجموعة')} hint={t('Same number = AND', 'نفس الرقم = و')}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={0}
                    value={rule.groupNumber}
                    onChange={(e) => updateRule(rule.key, { groupNumber: Number(e.target.value) })}
                    disabled={busy}
                  />
                )}
              </Field>
              <Field label={t('Field', 'الحقل')}>
                {(p) => (
                  <Select
                    {...p}
                    value={rule.field}
                    onChange={(e) => {
                      const field = e.target.value as CollectionRuleField;
                      updateRule(rule.key, {
                        field,
                        operator: FIELD_OPERATORS[field][0],
                        value: defaultValueForField(field),
                      });
                    }}
                    disabled={busy}
                  >
                    <option value="PRICE">{t('Price', 'السعر')}</option>
                    <option value="COMPARE_AT_PRICE">{t('Compare-at price', 'السعر قبل التخفيض')}</option>
                    <option value="PRODUCT_STATUS">{t('Product status', 'حالة المنتج')}</option>
                    <option value="STOCK_STATUS">{t('Stock status', 'حالة المخزون')}</option>
                    <option value="CATEGORY">{t('Category', 'الفئة')}</option>
                    <option value="CREATED_AT">{t('Date added', 'تاريخ الإضافة')}</option>
                    <option value="HAS_ACTIVE_PROMOTION">{t('Has an active promotion', 'لديه عرض نشط')}</option>
                  </Select>
                )}
              </Field>
              <Field label={t('Operator', 'العملية')}>
                {(p) => (
                  <Select
                    {...p}
                    value={rule.operator}
                    onChange={(e) => updateRule(rule.key, { operator: e.target.value as CollectionRuleOperator })}
                    disabled={busy || FIELD_OPERATORS[rule.field].length <= 1}
                  >
                    {FIELD_OPERATORS[rule.field].map((op) => (
                      <option key={op} value={op}>
                        {op.replace(/_/g, ' ').toLowerCase()}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label={t('Value', 'القيمة')}>
                {() => (
                  <RuleValueEditor
                    rule={rule}
                    onChange={(value) => updateRule(rule.key, { value })}
                    busy={busy}
                    locale={locale}
                  />
                )}
              </Field>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeRule(rule.key)}
                disabled={busy}
                aria-label={t('Remove rule', 'إزالة القاعدة')}
              >
                <Icon as={X} size={16} />
              </Button>
            </div>
          ))}
        </div>
      )}

      {error && <Alert tone="danger" className="stack">{error}</Alert>}
      {saved && !error && <Alert tone="success" className="stack">{t('Rules saved', 'تم حفظ القواعد')}</Alert>}

      <div className="admin-form__actions">
        <Button type="button" variant="outline" onClick={addRule} disabled={busy}>
          <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
          {t('Add rule', 'إضافة قاعدة')}
        </Button>
        <Button type="button" onClick={onSave} loading={busy}>
          {t('Save rules', 'حفظ القواعد')}
        </Button>
      </div>
    </div>
  );
}

export default function EditCollectionPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const id = typeof params?.id === 'string' ? params.id : '';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();

  const { data: collection, isPending, isError, refetch } = useCollection(id);
  const updateCollection = useUpdateCollection();
  const archiveCollection = useDeleteCollection();
  const restoreCollection = useRestoreCollection();
  const permanentDeleteCollection = usePermanentDeleteCollection();
  const addImage = useAddCollectionImage();
  const deleteImage = useDeleteCollectionImage();

  const [error, setError] = useState<string | null>(null);
  const [deleteImageId, setDeleteImageId] = useState<string | null>(null);

  const onSubmit = async (values: CollectionFormValues) => {
    setError(null);
    try {
      await updateCollection.mutateAsync({
        id,
        body: {
          nameEn: values.nameEn,
          nameAr: values.nameAr,
          slug: values.slug,
          descriptionEn: values.descriptionEn || undefined,
          descriptionAr: values.descriptionAr || undefined,
          isActive: values.isActive,
          type: values.type,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  // Three distinct actions, matching the list page's (admin/collections/page.tsx)
  // — a single "Delete" button here used to call the archive-only mutation
  // while claiming "This can't be undone", the opposite of what actually
  // happened (fix-list.md #15, resolves 12.8). Archive/Restore stay on this
  // page (the mutations invalidate the collection-detail query, so the
  // header re-renders with the new state); only the real permanent delete
  // navigates away, since the collection no longer exists afterward.
  const onArchiveCollection = async () => {
    if (!collection) return;
    const name = isAr ? collection.nameAr : collection.nameEn;
    if (
      !window.confirm(
        t(
          `Archive "${name}"? It will be hidden from the storefront but kept.`,
          `أرشفة "${name}"؟ ستُخفى من المتجر مع الاحتفاظ بها.`
        )
      )
    )
      return;
    try {
      await archiveCollection.mutateAsync(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Archive failed', 'فشلت الأرشفة'));
    }
  };

  const onRestoreCollection = async () => {
    try {
      await restoreCollection.mutateAsync(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Restore failed', 'فشلت الاستعادة'));
    }
  };

  const onPermanentDeleteCollection = async () => {
    if (!collection) return;
    const name = isAr ? collection.nameAr : collection.nameEn;
    if (!window.confirm(t(`Permanently delete "${name}"? This cannot be undone.`, `حذف "${name}" نهائيًا؟ لا يمكن التراجع.`))) return;
    try {
      await permanentDeleteCollection.mutateAsync(id);
      router.push(`/${locale}/admin/collections`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Delete failed', 'فشل الحذف'));
    }
  };

  if (isPending) {
    return (
      <div className="section--tight">
        <ProductGridSkeleton count={1} />
      </div>
    );
  }

  if (isError || !collection) {
    return (
      <div className="section--tight">
        <EmptyState
          tone="alert"
          title={t("Couldn't load this collection", 'تعذّر تحميل هذه المجموعة')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{isAr ? collection.nameAr : collection.nameEn}</h1>
        <span className="admin-row-actions">
          {collection.archivedAt ? (
            <>
              <Button variant="outline" onClick={onRestoreCollection} loading={restoreCollection.isPending}>
                <Icon as={RotateCcw} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
                {t('Restore', 'استعادة')}
              </Button>
              <Button variant="danger" onClick={onPermanentDeleteCollection} loading={permanentDeleteCollection.isPending}>
                <Icon as={Trash2} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
                {t('Delete permanently', 'حذف نهائي')}
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={onArchiveCollection} loading={archiveCollection.isPending}>
              <Icon as={Archive} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
              {t('Archive collection', 'أرشفة المجموعة')}
            </Button>
          )}
        </span>
      </div>

      <CollectionForm
        locale={locale}
        defaultValues={{
          nameEn: collection.nameEn,
          nameAr: collection.nameAr,
          slug: collection.slug,
          descriptionEn: collection.descriptionEn ?? '',
          descriptionAr: collection.descriptionAr ?? '',
          isActive: collection.isActive,
          type: collection.type,
        }}
        onSubmit={onSubmit}
        submitLabel={t('Save changes', 'حفظ التغييرات')}
        isSubmitting={updateCollection.isPending}
        submitError={error}
      />

      <div className="admin-form" style={{ marginTop: 'var(--space-7)' }}>
        <p className="admin-form__section-title">{t('Images', 'الصور')}</p>
        <ImageGallery
          images={collection.images}
          folder="/collections"
          locale={locale}
          onAdd={(img) => addImage.mutate({ id, body: { url: img.url, fileId: img.fileId } })}
          onDelete={(imageId) => {
            setDeleteImageId(imageId);
            deleteImage.mutate(
              { id, imageId },
              { onSettled: () => setDeleteImageId(null) }
            );
          }}
          isDeleting={(imageId) => deleteImageId === imageId && deleteImage.isPending}
        />
      </div>

      {collection.type !== 'AUTOMATED' && <CollectionProductsPanel id={id} locale={locale} />}
      {collection.type !== 'MANUAL' && <CollectionRulesPanel id={id} locale={locale} collection={collection} />}
    </div>
  );
}
