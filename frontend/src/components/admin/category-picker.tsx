'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Icon, Input, Modal } from '@/components/ui';
import { buildCategoryPaths } from '@/lib/category-path';
import type { Category } from '@/lib/types';

export interface CategoryPickerProps {
  categories: Category[];
  value: string;
  onChange: (id: string) => void;
  locale: 'en' | 'ar';
  disabled?: boolean;
  placeholder?: string;
  /** Shown as the first, always-selectable row (e.g. "Top level (no
   *  parent)") — value `''`. Omit for a picker where something must always
   *  be chosen (e.g. a product's primary category). */
  emptyOption?: string;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

/**
 * Single-select category picker — replaces a native `<select>` whose flat,
 * dash-indented option list can't tell an admin which of several same-named
 * categories from different branches (a "Shoes" under Women, Men, AND Kids)
 * a given row actually is. Search + one clickable row per category, each
 * showing its full ancestor breadcrumb, in a modal (reuses the same
 * focus-trap / Esc-to-close / scroll-lock the rest of the admin's modals
 * already have, rather than a bespoke floating popover).
 */
export function CategoryPicker({
  categories,
  value,
  onChange,
  locale,
  disabled,
  placeholder,
  emptyOption,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: CategoryPickerProps) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const paths = useMemo(() => buildCategoryPaths(categories, isAr), [categories, isAr]);

  const selected = categories.find((c) => c.id === value);
  // Non-blocking — the row itself may still be perfectly valid, just
  // currently unreachable on the storefront (same principle as the
  // per-row " (archived)" flag below). A product already placed here keeps
  // that placement on save; this just tells the admin why they're seeing a
  // category that looks otherwise unremarkable in this picker.
  const selectedArchived = Boolean(selected?.isEffectivelyArchived);
  const selectedLabel = selected
    ? [paths.get(selected.id), isAr ? selected.nameAr : selected.nameEn].filter(Boolean).join(isAr ? ' « ' : ' › ') +
      (selectedArchived ? t(' (archived)', ' (مؤرشفة)') : '')
    : value === '' && emptyOption
      ? emptyOption
      : '';

  const query = search.trim().toLowerCase();
  const filtered = query
    ? categories.filter((c) => {
        const name = isAr ? c.nameAr : c.nameEn;
        return `${paths.get(c.id) ?? ''} ${name}`.toLowerCase().includes(query);
      })
    : categories;

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  return (
    <>
      <button
        type="button"
        id={id}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        className="input category-picker__trigger"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <span className={selectedLabel ? undefined : 'category-picker__placeholder'}>
          {selectedLabel || placeholder || t('Choose a category', 'اختر فئة')}
        </span>
        <Icon as={ChevronDown} size={16} />
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={t('Choose a category', 'اختر فئة')}>
        <div className="category-picker__modal">
          <p className="category-picker__title">{t('Choose a category', 'اختر فئة')}</p>
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('Search categories…', 'ابحث عن فئة…')}
          />
          <div className="category-picker__list" role="listbox">
            {emptyOption && !query && (
              <button
                type="button"
                role="option"
                aria-selected={value === ''}
                className="category-picker__row"
                data-selected={value === '' ? '' : undefined}
                onClick={() => choose('')}
              >
                <span className="category-picker__row-name">{emptyOption}</span>
                {value === '' && <Icon as={Check} size={16} />}
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="category-picker__empty">{t('No matches', 'لا نتائج')}</p>
            ) : (
              filtered.map((c) => {
                const path = paths.get(c.id);
                const archived = Boolean(c.isEffectivelyArchived);
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="option"
                    aria-selected={c.id === value}
                    className="category-picker__row"
                    data-selected={c.id === value ? '' : undefined}
                    data-disabled={archived ? '' : undefined}
                    disabled={archived}
                    onClick={() => choose(c.id)}
                  >
                    <span className="category-picker__row-text">
                      <span className="category-picker__row-name">
                        {isAr ? c.nameAr : c.nameEn}
                        {archived ? t(' (archived)', ' (مؤرشفة)') : ''}
                      </span>
                      {path && <span className="category-picker__row-path">{path}</span>}
                    </span>
                    {c.id === value && <Icon as={Check} size={16} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
