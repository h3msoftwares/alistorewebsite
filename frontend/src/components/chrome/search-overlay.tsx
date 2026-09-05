'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { CatalogImage, Icon, PriceTag } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useProducts } from '@/hooks/use-catalog';

const MIN_CHARS = 2;
const MAX_RESULTS = 8;

/**
 * Header search: type-ahead over the catalogue. The input is debounced and,
 * once it has at least MIN_CHARS, drives `GET /api/products?search=…` via
 * `useProducts`. Results are a compact list of product links; picking one
 * closes the overlay. Lives inside the shared `Drawer` (focus-trapped, Esc /
 * backdrop / X to close), same as the cart drawer and mobile menu.
 */
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
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const [term, setTerm] = useState('');
  const query = useDebouncedValue(term.trim(), 300);
  const canSearch = query.length >= MIN_CHARS;

  const { data, isError, isFetching } = useProducts(
    { search: query, pageSize: MAX_RESULTS },
    { enabled: canSearch },
  );

  const items = data?.items ?? [];
  const extra = data ? data.total - items.length : 0;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      side="end"
      title={t('Search', 'بحث')}
      closeLabel={t('Close search', 'إغلاق البحث')}
    >
      <form role="search" className="search-overlay__form" onSubmit={(e) => e.preventDefault()}>
        <span className="search-overlay__icon" aria-hidden>
          <Icon as={Search} />
        </span>
        <input
          type="search"
          className="input"
          autoComplete="off"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={isAr ? 'ابحث عن منتجات…' : 'Search products…'}
          aria-label={isAr ? 'ابحث عن منتجات' : 'Search products'}
        />
      </form>

      {!canSearch ? (
        <p className="search-overlay__hint">
          {isAr ? 'اكتب حرفين على الأقل للبحث في الكتالوج.' : 'Type at least 2 characters to search the catalogue.'}
        </p>
      ) : isError ? (
        <p className="search-overlay__hint" role="alert">
          {isAr ? 'تعذّر البحث. حاول مرة أخرى.' : "Couldn't run that search. Try again."}
        </p>
      ) : !data ? (
        <p className="search-overlay__hint" aria-live="polite">
          {isAr ? 'جارٍ البحث…' : 'Searching…'}
        </p>
      ) : items.length === 0 ? (
        <p className="search-overlay__hint" aria-live="polite">
          {isAr ? `لا نتائج لـ «${query}».` : `No products match “${query}”.`}
        </p>
      ) : (
        <div aria-live="polite" aria-busy={isFetching || undefined}>
          <ul className="search-overlay__results" role="list">
            {items.map((product) => {
              const name = isAr ? product.nameAr : product.nameEn;
              const image = product.images.find((img) => !img.color) ?? product.images[0];
              return (
                <li key={product.id}>
                  <Link
                    href={`/${locale}/product/${product.id}`}
                    className="search-overlay__result"
                    onClick={onClose}
                  >
                    <span className="search-overlay__result-thumb" aria-hidden>
                      {image && (
                        <CatalogImage src={image.url} alt="" fill sizes="48px" />
                      )}
                    </span>
                    <span className="search-overlay__result-body">
                      <span className="search-overlay__result-name">{name}</span>
                      <PriceTag
                        price={product.price}
                        compareAtPrice={product.compareAtPrice}
                        salePrice={product.onSale ? product.effectivePrice : null}
                        locale={locale as 'en' | 'ar'}
                        showBadge={false}
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {extra > 0 && (
            <p className="search-overlay__hint">
              {isAr
                ? `تُعرض أول ${items.length} من ${data.total} نتيجة.`
                : `Showing the first ${items.length} of ${data.total} matches.`}
            </p>
          )}
        </div>
      )}
    </Drawer>
  );
}
