'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Icon, Select } from '@/components/ui';
import type { CatalogStatus } from '@/lib/types';

/**
 * Search box (debounced) + Active / Archived / All status filter for the
 * admin Collections / Categories / Products list pages. `onSearchChange` and
 * `onStatusChange` must be stable (pass `useState` setters or `useCallback`)
 * — the page owns the state and resets its page number when either changes.
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
  useEffect(() => {
    if (draft.trim() === search) return;
    const id = window.setTimeout(() => onSearchChange(draft.trim()), 300);
    return () => window.clearTimeout(id);
  }, [draft, search, onSearchChange]);

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
