'use client';

import { Search } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';

// Structure only. TODO: debounce the input, hit GET /api/products?search=…
// via useProducts(), and render results / recent searches.
export function SearchOverlay({
  open,
  onClose,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  locale: string;
}) {
  const isAr = locale === 'ar';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      side="end"
      title={isAr ? 'بحث' : 'Search'}
      closeLabel={isAr ? 'إغلاق البحث' : 'Close search'}
    >
      <form
        role="search"
        className="search-overlay__form"
        onSubmit={(e) => e.preventDefault()}
      >
        <span className="search-overlay__icon" aria-hidden>
          <Icon as={Search} />
        </span>
        <input
          type="search"
          className="input"
          autoComplete="off"
          placeholder={isAr ? 'ابحث عن منتجات…' : 'Search products…'}
          aria-label={isAr ? 'ابحث عن منتجات' : 'Search products'}
        />
      </form>
      <p className="search-overlay__hint">
        {isAr ? 'اكتب للبحث في الكتالوج.' : 'Start typing to search the catalogue.'}
      </p>
    </Drawer>
  );
}
