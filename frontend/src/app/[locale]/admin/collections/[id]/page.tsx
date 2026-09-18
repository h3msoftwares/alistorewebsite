'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Archive, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Alert, Button, CheckList, Choice, ConfirmModal, DataTable, EmptyState, Field, Icon, Input, Modal, ProductGridSkeleton, Select } from '@/components/ui';
import { AdminPager } from '@/components/admin/admin-pager';
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
  usePreviewCollectionRules,
  useUpdateCollection,
} from '@/hooks/use-catalog';
import { buildCategoryPaths } from '@/lib/category-path';
import type { Collection, CollectionRule, CollectionRuleField, CollectionRuleOperator } from '@/lib/types';
import { CollectionForm, type CollectionFormValues } from '../collection-form';

const COLLECTION_TYPE_COPY: Record<
  Collection['type'],
  { badgeEn: string; badgeAr: string; en: string; ar: string; tone: string }
> = {
  MANUAL: {
    badgeEn: 'Manual',
    badgeAr: 'يدوي',
    en: 'Membership is picked by hand below — nothing here is computed.',
    ar: 'يتم اختيار العضوية يدويًا أدناه — لا شيء هنا محسوب تلقائيًا.',
    tone: 'draft',
  },
  AUTOMATED: {
    badgeEn: 'Automated',
    badgeAr: 'تلقائي',
    en: 'Membership is computed entirely from the rules below — the product list is read-only.',
    ar: 'تُحسب العضوية بالكامل من القواعد أدناه — قائمة المنتجات للعرض فقط.',
    tone: 'scheduled',
  },
  HYBRID: {
    badgeEn: 'Hybrid',
    badgeAr: 'مختلط',
    en: 'Membership follows the rules below, plus any product you add or remove by hand here.',
    ar: 'تتبع العضوية القواعد أدناه، بالإضافة إلى أي منتج تضيفه أو تزيله يدويًا هنا.',
    tone: 'live',
  },
};

function CollectionTypeExplainer({ type, isAr }: { type: Collection['type']; isAr: boolean }) {
  const copy = COLLECTION_TYPE_COPY[type];
  return (
    <div
      style={{
        marginTop: 'var(--space-7)',
        display: 'flex',
        alignItems: 'baseline',
        gap: 'var(--space-3)',
        flexWrap: 'wrap',
      }}
    >
      <span className={`status status--${copy.tone}`}>{isAr ? copy.badgeAr : copy.badgeEn}</span>
      <p className="admin-form__hint" style={{ margin: 0 }}>
        {isAr ? copy.ar : copy.en}
      </p>
    </div>
  );
}

const PRODUCTS_PAGE_SIZE = 20;

/** Product membership. Manual add/remove for MANUAL (the whole membership)
 *  and HYBRID (an INCLUDE overlay on top of the rule-computed set, see
 *  CollectionRulesPanel below) — read-only for AUTOMATED, where membership
 *  comes entirely from rules: still worth showing so an admin editing rules
 *  can see what currently matches, just without add/remove controls.
 *
 *  The linked list is a table with its own pager (a collection can hold
 *  hundreds of products — an unbounded <ul> made the page unusably long),
 *  and adding products moved into its own dialog so the search UI doesn't
 *  permanently push the table down the page. */
function CollectionProductsPanel({
  id,
  locale,
  readOnly = false,
}: {
  id: string;
  locale: 'en' | 'ar';
  readOnly?: boolean;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { data: linked, isPending } = useCollectionProducts(id);
  const setProducts = useSetCollectionProducts();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: results } = useProducts({ search, pageSize: 10 }, { enabled: !readOnly && addOpen && search.trim().length >= 2 });
  const [page, setPage] = useState(1);

  const linkedIds = (linked ?? []).map((p) => p.id);
  const addProduct = (productId: string) => {
    if (linkedIds.includes(productId)) return;
    setProducts.mutate({ id, productIds: [...linkedIds, productId] });
  };
  const removeProduct = (productId: string) => {
    setProducts.mutate({ id, productIds: linkedIds.filter((pid) => pid !== productId) });
  };

  const totalPages = Math.max(1, Math.ceil((linked ?? []).length / PRODUCTS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = (linked ?? []).slice((safePage - 1) * PRODUCTS_PAGE_SIZE, safePage * PRODUCTS_PAGE_SIZE);

  const closeAdd = () => {
    setAddOpen(false);
    setSearch('');
  };

  return (
    <div className="admin-form" style={{ marginTop: 'var(--space-7)' }}>
      <div className="admin-page__head-actions" style={{ justifyContent: 'space-between' }}>
        <p className="admin-form__section-title" style={{ margin: 0 }}>
          {t('Products', 'المنتجات')}
          {!isPending && ` (${(linked ?? []).length})`}
        </p>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
            {t('Add products', 'إضافة منتجات')}
          </Button>
        )}
      </div>
      {readOnly && (
        <p className="admin-form__hint">
          {t(
            'Computed live from the rules below — read-only here.',
            'يُحسب تلقائيًا من القواعد أدناه — للعرض فقط هنا.'
          )}
        </p>
      )}

      {isPending ? (
        <ProductGridSkeleton count={3} />
      ) : (linked ?? []).length === 0 ? (
        <p className="admin-form__hint">
          {readOnly
            ? t('No products currently match these rules.', 'لا توجد منتجات مطابقة لهذه القواعد حاليًا.')
            : t('No products in this collection yet.', 'لا توجد منتجات في هذه المجموعة بعد.')}
        </p>
      ) : (
        <>
          <DataTable responsive>
            <thead>
              <tr>
                <th>{t('Product', 'المنتج')}</th>
                <th>{t('SKU', 'رمز المنتج')}</th>
                {!readOnly && <th />}
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr key={p.id}>
                  <td data-label={t('Product', 'المنتج')}>{isAr ? p.nameAr : p.nameEn}</td>
                  <td data-label={t('SKU', 'رمز المنتج')}>{p.sku}</td>
                  {!readOnly && (
                    <td>
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
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </DataTable>
          <AdminPager page={safePage} totalPages={totalPages} onPageChange={setPage} locale={locale} />
        </>
      )}

      {!readOnly && (
        <Modal open={addOpen} onClose={closeAdd} title={t('Add products', 'إضافة منتجات')}>
          <div className="stack" style={{ padding: 'var(--space-5)' }}>
            <h2 style={{ margin: 0 }}>{t('Add products', 'إضافة منتجات')}</h2>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Search products to add…', 'ابحث عن منتجات لإضافتها…')}
              autoFocus
            />
            {search.trim().length >= 2 && (
              (results?.items.filter((p) => !linkedIds.includes(p.id)).length ?? 0) === 0 ? (
                <p className="admin-form__hint">{t('No matching products.', 'لا توجد منتجات مطابقة.')}</p>
              ) : (
                <ul role="list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--space-2)' }}>
                  {results?.items
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
              )
            )}
            <div className="admin-modal__actions">
              <Button type="button" variant="primary" onClick={closeAdd}>
                {t('Done', 'تم')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
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

const FIELD_LABEL: Record<CollectionRuleField, { en: string; ar: string }> = {
  PRICE: { en: 'Price', ar: 'السعر' },
  COMPARE_AT_PRICE: { en: 'Compare-at price', ar: 'السعر قبل التخفيض' },
  PRODUCT_STATUS: { en: 'Product status', ar: 'حالة المنتج' },
  STOCK_STATUS: { en: 'Stock status', ar: 'حالة المخزون' },
  CATEGORY: { en: 'Category', ar: 'الفئة' },
  CREATED_AT: { en: 'Date added', ar: 'تاريخ الإضافة' },
  HAS_ACTIVE_PROMOTION: { en: 'Has an active promotion', ar: 'لديه عرض نشط' },
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
  const previewRules = usePreviewCollectionRules();
  const [rules, setRulesState] = useState<DraftRule[]>(() =>
    (collection.rules ?? []).map((r) => ({ ...r, key: r.id ?? newRuleKey() }))
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const busy = setRules.isPending;

  // The rule currently open in the add/edit dialog — a draft copy, only
  // merged into `rules` on "Save rule"/"Add rule" so Cancel discards it
  // cleanly.
  const [dialogRule, setDialogRule] = useState<DraftRule | null>(null);
  const [isNewInDialog, setIsNewInDialog] = useState(false);

  const removeRule = (key: string) => {
    setSaved(false);
    previewRules.reset();
    setRulesState((rs) => rs.filter((r) => r.key !== key));
  };
  const openAddRule = () => {
    const nextGroup = rules.length ? Math.max(...rules.map((r) => r.groupNumber)) + 1 : 0;
    setDialogRule({ key: newRuleKey(), groupNumber: nextGroup, field: 'PRICE', operator: 'GREATER_THAN_OR_EQUAL', value: 0 });
    setIsNewInDialog(true);
  };
  const openEditRule = (rule: DraftRule) => {
    setDialogRule({ ...rule });
    setIsNewInDialog(false);
  };
  const closeRuleDialog = () => setDialogRule(null);
  const saveDialogRule = () => {
    if (!dialogRule) return;
    setSaved(false);
    previewRules.reset();
    setRulesState((rs) => (isNewInDialog ? [...rs, dialogRule] : rs.map((r) => (r.key === dialogRule.key ? dialogRule : r))));
    setDialogRule(null);
  };
  const runPreview = () => {
    previewRules.mutate({
      id,
      rules: rules.map(({ groupNumber, field, operator, value }) => ({ groupNumber, field, operator, value })),
    });
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

  const valueDisplay = (rule: DraftRule): string => {
    switch (rule.field) {
      case 'HAS_ACTIVE_PROMOTION':
        return '—';
      case 'CREATED_AT':
        return typeof rule.value === 'string' ? rule.value.slice(0, 10) : '';
      case 'CATEGORY': {
        const obj = (rule.value ?? {}) as { categoryIds?: string[] };
        return t(`${(obj.categoryIds ?? []).length} categories`, `${(obj.categoryIds ?? []).length} فئات`);
      }
      default:
        return String(rule.value ?? '');
    }
  };

  return (
    <div className="admin-form" style={{ marginTop: 'var(--space-7)' }}>
      <div className="admin-page__head-actions" style={{ justifyContent: 'space-between' }}>
        <p className="admin-form__section-title" style={{ margin: 0 }}>{t('Rules', 'القواعد')}</p>
        <Button type="button" variant="outline" size="sm" onClick={openAddRule} disabled={busy}>
          <Icon as={Plus} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
          {t('Add rule', 'إضافة قاعدة')}
        </Button>
      </div>
      <p className="admin-form__hint">
        {t(
          'Rules with the same group number are ANDed together; different group numbers are ORed.',
          'القواعد بنفس رقم المجموعة تُطبَّق معًا (و)؛ أرقام المجموعات المختلفة تُطبَّق كأي منها (أو).'
        )}
      </p>

      {rules.length === 0 ? (
        <p className="admin-form__hint">{t('No rules yet — this collection matches nothing.', 'لا توجد قواعد بعد — لن تطابق هذه المجموعة أي شيء.')}</p>
      ) : (
        <DataTable responsive>
          <thead>
            <tr>
              <th>{t('Group', 'المجموعة')}</th>
              <th>{t('Field', 'الحقل')}</th>
              <th>{t('Operator', 'العملية')}</th>
              <th>{t('Value', 'القيمة')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.key}>
                <td data-label={t('Group', 'المجموعة')}>{rule.groupNumber}</td>
                <td data-label={t('Field', 'الحقل')}>{isAr ? FIELD_LABEL[rule.field].ar : FIELD_LABEL[rule.field].en}</td>
                <td data-label={t('Operator', 'العملية')}>{rule.operator.replace(/_/g, ' ').toLowerCase()}</td>
                <td data-label={t('Value', 'القيمة')}>{valueDisplay(rule)}</td>
                <td>
                  <span className="admin-row-actions">
                    <Button type="button" variant="ghost" size="sm" onClick={() => openEditRule(rule)} disabled={busy}>
                      {t('Edit', 'تعديل')}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeRule(rule.key)} disabled={busy}>
                      {t('Remove', 'إزالة')}
                    </Button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <Modal
        open={dialogRule !== null}
        onClose={closeRuleDialog}
        title={isNewInDialog ? t('Add rule', 'إضافة قاعدة') : t('Edit rule', 'تعديل القاعدة')}
      >
        {dialogRule && (
          <div className="admin-form" style={{ padding: 'var(--space-5)' }}>
            <p className="admin-form__section-title">{isNewInDialog ? t('Add rule', 'إضافة قاعدة') : t('Edit rule', 'تعديل القاعدة')}</p>
            <div className="admin-form__row">
              <Field label={t('Group', 'المجموعة')} hint={t('Same number = AND', 'نفس الرقم = و')}>
                {(p) => (
                  <Input
                    {...p}
                    type="number"
                    min={0}
                    value={dialogRule.groupNumber}
                    onChange={(e) => setDialogRule({ ...dialogRule, groupNumber: Number(e.target.value) })}
                    autoFocus
                  />
                )}
              </Field>
              <Field label={t('Field', 'الحقل')}>
                {(p) => (
                  <Select
                    {...p}
                    value={dialogRule.field}
                    onChange={(e) => {
                      const field = e.target.value as CollectionRuleField;
                      setDialogRule({
                        ...dialogRule,
                        field,
                        operator: FIELD_OPERATORS[field][0],
                        value: defaultValueForField(field),
                      });
                    }}
                  >
                    {(Object.keys(FIELD_LABEL) as CollectionRuleField[]).map((f) => (
                      <option key={f} value={f}>
                        {isAr ? FIELD_LABEL[f].ar : FIELD_LABEL[f].en}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <div className="admin-form__row">
              <Field label={t('Operator', 'العملية')}>
                {(p) => (
                  <Select
                    {...p}
                    value={dialogRule.operator}
                    onChange={(e) => setDialogRule({ ...dialogRule, operator: e.target.value as CollectionRuleOperator })}
                    disabled={FIELD_OPERATORS[dialogRule.field].length <= 1}
                  >
                    {FIELD_OPERATORS[dialogRule.field].map((op) => (
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
                    rule={dialogRule}
                    onChange={(value) => setDialogRule({ ...dialogRule, value })}
                    busy={false}
                    locale={locale}
                  />
                )}
              </Field>
            </div>
            <div className="admin-form__actions">
              <Button type="button" onClick={saveDialogRule}>
                {isNewInDialog ? t('Add rule', 'إضافة قاعدة') : t('Save rule', 'حفظ القاعدة')}
              </Button>
              <Button type="button" variant="ghost" onClick={closeRuleDialog}>
                {t('Cancel', 'إلغاء')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {rules.length > 0 && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Button type="button" variant="outline" size="sm" loading={previewRules.isPending} onClick={runPreview}>
            {t('Preview matching products', 'معاينة المنتجات المطابقة')}
          </Button>
          {previewRules.data && (
            <p className="admin-form__hint" style={{ marginTop: 'var(--space-2)' }}>
              {t(
                `These rules currently match ${previewRules.data.count} live product(s).`,
                `تطابق هذه القواعد حاليًا ${previewRules.data.count} منتج حيّ.`
              )}
              {previewRules.data.sample.length > 0 &&
                ` ${t('For example:', 'على سبيل المثال:')} ${previewRules.data.sample
                  .map((s) => (isAr ? s.nameAr : s.nameEn))
                  .join(', ')}${previewRules.data.count > previewRules.data.sample.length ? '…' : ''}`}
            </p>
          )}
          {previewRules.isError && (
            <Alert tone="danger" className="stack">
              {t('Could not compute the preview.', 'تعذّر حساب المعاينة.')}
            </Alert>
          )}
        </div>
      )}

      {error && <Alert tone="danger" className="stack">{error}</Alert>}
      {saved && !error && <Alert tone="success" className="stack">{t('Rules saved', 'تم حفظ القواعد')}</Alert>}

      <div className="admin-form__actions">
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
  const [confirmKind, setConfirmKind] = useState<'archive' | 'delete' | null>(null);

  const doArchiveCollection = async () => {
    try {
      await archiveCollection.mutateAsync(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Archive failed', 'فشلت الأرشفة'));
    } finally {
      setConfirmKind(null);
    }
  };

  const onRestoreCollection = async () => {
    try {
      await restoreCollection.mutateAsync(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Restore failed', 'فشلت الاستعادة'));
    }
  };

  const doPermanentDeleteCollection = async () => {
    try {
      await permanentDeleteCollection.mutateAsync(id);
      router.push(`/${locale}/admin/collections`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Delete failed', 'فشل الحذف'));
      setConfirmKind(null);
    }
  };

  const collectionName = collection ? (isAr ? collection.nameAr : collection.nameEn) : '';

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
                <Icon as={RotateCcw} size={16} />
                {t('Restore', 'استعادة')}
              </Button>
              <Button variant="danger" onClick={() => setConfirmKind('delete')} loading={permanentDeleteCollection.isPending}>
                <Icon as={Trash2} size={16} />
                {t('Delete permanently', 'حذف نهائي')}
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmKind('archive')} loading={archiveCollection.isPending}>
              <Icon as={Archive} size={16} />
              {t('Archive collection', 'أرشفة المجموعة')}
            </Button>
          )}
        </span>
      </div>

      <ConfirmModal
        open={confirmKind !== null}
        onClose={() => setConfirmKind(null)}
        onConfirm={() => void (confirmKind === 'archive' ? doArchiveCollection() : doPermanentDeleteCollection())}
        title={
          confirmKind === 'archive'
            ? t(`Archive "${collectionName}"?`, `أرشفة "${collectionName}"؟`)
            : t(`Permanently delete "${collectionName}"?`, `حذف "${collectionName}" نهائيًا؟`)
        }
        body={
          confirmKind === 'archive'
            ? t('It will be hidden from the storefront but kept.', 'ستُخفى من المتجر مع الاحتفاظ بها.')
            : t('This cannot be undone.', 'لا يمكن التراجع عن هذا.')
        }
        confirmLabel={confirmKind === 'archive' ? t('Archive', 'أرشفة') : t('Delete', 'حذف')}
        cancelLabel={t('Cancel', 'إلغاء')}
        tone={confirmKind === 'delete' ? 'danger' : 'default'}
        loading={confirmKind === 'archive' ? archiveCollection.isPending : permanentDeleteCollection.isPending}
      />

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

      <CollectionTypeExplainer type={collection.type} isAr={isAr} />
      <CollectionProductsPanel id={id} locale={locale} readOnly={collection.type === 'AUTOMATED'} />
      {collection.type !== 'MANUAL' && <CollectionRulesPanel id={id} locale={locale} collection={collection} />}
    </div>
  );
}
