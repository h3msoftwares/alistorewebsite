'use client';

import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { Icon, Select } from '@/components/ui';
import type { CatalogStatus } from '@/lib/types';

/**
 * Search box (debounced) + Active / Archived / All status filter for the
 * admin Collections / Categories / Products list pages. `onSearchChange` and
 * `onStatusChange` can be passed as plain inline callbacks — the debounce
 * timer below reads the latest `onSearchChange` through a ref instead of
 * depending on its identity, so an unstable function reference (a fresh
 * arrow function every render) can't reset an in-flight debounce.
 */
export function AdminListControls({
  search,
  onSearchChange,
  status,
  onStatusChange,
  locale,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  status: CatalogStatus;
  onStatusChange: (value: CatalogStatus) => void;
  locale: 'en' | 'ar';
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  // Local draft so typing doesn't refetch on every keystroke; the committed
  // value is pushed up (debounced) and owned by the page.
  const [draft, setDraft] = useState(search);

  // Latest callback in a ref, kept out of the debounce effect's deps below —
  // otherwise a caller re-rendering with a fresh inline `onSearchChange`
  // (unrelated to typing, e.g. a background refetch) would reset the timer
  // on every render and the search could never actually fire while busy.
  const onSearchChangeRef = useRef(onSearchChange);
  useEffect(() => {
    onSearchChangeRef.current = onSearchChange;
  }, [onSearchChange]);

  useEffect(() => {
    if (draft.trim() === search) return;
    const id = window.setTimeout(() => onSearchChangeRef.current(draft.trim()), 300);
    return () => window.clearTimeout(id);
  }, [draft, search]);

  return (
    <div className="admin-list-controls">
      <span className="admin-list-controls__search">
        <Icon as={Search} size={16} />
        <input
          type="search"
          className="input"
          placeholder={t('Search by name or slug…', 'ابحث بالاسم أو الرابط…')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={t('Search', 'بحث')}
        />
      </span>
      <Select
        value={status}
        onChange={(e) => onStatusChange(e.target.value as CatalogStatus)}
        aria-label={t('Status filter', 'تصفية الحالة')}
      >
        <option value="active">{t('Active', 'المفعّلة')}</option>
        <option value="archived">{t('Archived', 'المؤرشفة')}</option>
        <option value="all">{t('All', 'الكل')}</option>
      </Select>
    </div>
  );
}
