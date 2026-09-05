'use client';

import { Button } from '@/components/ui';

/** Prev · "Page X of Y" · Next for the admin list pages. Renders nothing
 *  when there's only one page. */
export function AdminPager({
  page,
  totalPages,
  onPageChange,
  locale,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  locale: 'en' | 'ar';
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  if (totalPages <= 1) return null;

  return (
    <div className="admin-pager">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        {t('Previous', 'السابق')}
      </Button>
      <span className="admin-pager__status">
        {isAr ? `صفحة ${page} من ${totalPages}` : `Page ${page} of ${totalPages}`}
      </span>
      <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        {t('Next', 'التالي')}
      </Button>
    </div>
  );
}
