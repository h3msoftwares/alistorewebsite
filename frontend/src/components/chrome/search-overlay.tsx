'use client';

import {
  Fragment,
  useEffect,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, Search, Sparkles } from 'lucide-react';
import { Drawer } from '@/components/ui/drawer';
import { CatalogImage, Icon, PriceTag } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNavCategories, useProducts } from '@/hooks/use-catalog';

const MIN_CHARS = 2;
const MAX_RESULTS = 8;
const RECENT_KEY = 'alistore:recent-searches';
const RECENT_MAX = 6;
const SUGGEST_MAX = 6;
const IDLE_MAX = 10;

// `false` on the server / first client render, `true` after mount — so reading
// localStorage for recent searches can't cause a hydration mismatch, without a
// setState-in-effect.
const subscribe = () => () => {};
const useHydrated = () => useSyncExternalStore(subscribe, () => true, () => false);

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

/** Prepend `term` (case-insensitive de-dupe), cap the list, persist, and
 *  return the new list. A no-op (returns the current list) below MIN_CHARS. */
function pushRecent(term: string): string[] {
  const t = term.trim();
  const current = readRecent();
  if (t.length < MIN_CHARS) return current;
  const next = [t, ...current.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX);
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota — recent searches just won't persist */
  }
  return next;
}

function clearRecent(): void {
  try {
    window.localStorage.removeItem(RECENT_KEY);
  } catch {
    /* ignore */
  }
}

const optionId = (i: number) => `search-option-${i}`;

/**
 * Header search: type-ahead over the catalogue. The input is debounced and,
 * once it has at least MIN_CHARS, drives `GET /api/products?search=…` via
 * `useProducts`. Below MIN_CHARS it offers suggestions — the shopper's recent
 * searches, then "Popular searches" (the nav collections) to fill an empty
 * box. Either list is keyboard-navigable from the input — ↑/↓ move a highlight
 * (ARIA combobox / `aria-activedescendant`, focus stays in the box), Enter
 * opens the highlighted product or fills the highlighted suggestion, Home/End
 * jump to the ends. Lives inside the shared `Drawer` (focus-trapped, Esc /
 * backdrop / X to close).
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
  const router = useRouter();
  const hydrated = useHydrated();

  const [term, setTerm] = useState('');
  const rawQuery = term.trim();
  const query = useDebouncedValue(rawQuery, 300);

  const wantsSearch = rawQuery.length >= MIN_CHARS;
  const queryLongEnough = query.length >= MIN_CHARS;

  // Recent searches — loaded from localStorage once, after mount (adjust
  // during render, so no hydration mismatch and no setState-in-effect), then
  // kept in step by the commit / clear handlers.
  const [recent, setRecent] = useState<string[]>([]);
  const [recentLoaded, setRecentLoaded] = useState(false);
  if (hydrated && !recentLoaded) {
    setRecentLoaded(true);
    setRecent(readRecent());
  }

  // "Popular searches" — the nav categories (already cached: the root layout
  // prefetches them). Names double as good search terms.
  const { data: navCategories } = useNavCategories();
  const recentLower = new Set(recent.map((r) => r.toLowerCase()));
  const suggestions = (navCategories ?? [])
    .map((c) => (isAr ? c.nameAr : c.nameEn).trim())
    .filter((name) => name && !recentLower.has(name.toLowerCase()))
    .slice(0, SUGGEST_MAX);

  // The single navigable list shown while the box is (near-)empty.
  const idleOptions: { label: string; kind: 'recent' | 'suggestion' }[] = [
    ...recent.map((label) => ({ label, kind: 'recent' as const })),
    ...suggestions.map((label) => ({ label, kind: 'suggestion' as const })),
  ].slice(0, IDLE_MAX);

  // keepPreviousData:false — a type-ahead must never show the previous query's
  // hits under a new search term, nor keep them after the new query resolves
  // to fewer / zero.
  const { data, isError } = useProducts(
    { search: query, pageSize: MAX_RESULTS },
    { enabled: queryLongEnough, keepPreviousData: false },
  );

  // What to render. `data` is only trusted once the debounced query has caught
  // up with what's typed (`query === rawQuery`) — otherwise we're mid-debounce
  // and whatever `data` holds is for an older term.
  type Phase = 'idle' | 'suggest' | 'searching' | 'error' | 'empty' | 'results';
  const settled = wantsSearch && query === rawQuery && queryLongEnough && !isError && data !== undefined;
  const phase: Phase = !wantsSearch
    ? idleOptions.length > 0
      ? 'suggest'
      : 'idle'
    : query === rawQuery && isError
      ? 'error'
      : !settled
        ? 'searching'
        : data!.items.length === 0
          ? 'empty'
          : 'results';

  const items = phase === 'results' && data ? data.items : [];
  const extra = phase === 'results' && data ? data.total - data.items.length : 0;

  const mode: 'results' | 'suggest' | 'none' =
    phase === 'results' ? 'results' : phase === 'suggest' ? 'suggest' : 'none';
  const navLen = mode === 'results' ? items.length : mode === 'suggest' ? idleOptions.length : 0;

  // Clear the box each time the overlay closes, so reopening starts fresh —
  // and shows recent-search suggestions rather than the last result set.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setTerm('');
  }

  // Reset the highlight whenever the navigable list changes (new query, results
  // arrived, overlay reopened) — adjust-during-render, not an effect.
  const navSig = `${open}|${phase}|${rawQuery}|${items.map((p) => p.id).join(',')}|${idleOptions
    .map((o) => `${o.kind}:${o.label}`)
    .join(',')}`;
  const [sig, setSig] = useState(navSig);
  const [activeIndex, setActiveIndex] = useState(-1);
  if (sig !== navSig) {
    setSig(navSig);
    setActiveIndex(-1);
  }

  // Keep the highlighted option scrolled into view (DOM side effect only;
  // `scrollIntoView` is a no-op / undefined in jsdom).
  useEffect(() => {
    if (activeIndex >= 0) {
      document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [activeIndex]);

  const commitQuery = () => setRecent(pushRecent(query));

  const goToProduct = (id: string) => {
    commitQuery();
    onClose();
    router.push(`/${locale}/product/${id}`);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, navLen - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Home' && navLen > 0) {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End' && navLen > 0) {
      e.preventDefault();
      setActiveIndex(navLen - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (mode === 'suggest' && activeIndex >= 0) {
        setTerm(idleOptions[activeIndex].label);
      } else if (mode === 'results') {
        // A highlighted result, or — with nothing highlighted — the top hit.
        const target = activeIndex >= 0 ? items[activeIndex] : items[0];
        if (target) goToProduct(target.id);
      }
    }
  };

  const listboxId = 'search-overlay-listbox';
  const showListbox = mode !== 'none';

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
          role="combobox"
          aria-expanded={showListbox}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={isAr ? 'ابحث عن منتجات…' : 'Search products…'}
          aria-label={isAr ? 'ابحث عن منتجات' : 'Search products'}
        />
      </form>

      {mode === 'suggest' && (
        <div>
          {recent.length > 0 && (
            <div className="search-overlay__recent-head">
              <span className="search-overlay__hint" style={{ margin: 0 }}>
                {t('Recent searches', 'عمليات البحث الأخيرة')}
              </span>
              <button
                type="button"
                className="search-overlay__clear"
                onClick={() => {
                  clearRecent();
                  setRecent([]);
                }}
              >
                {t('Clear', 'مسح')}
              </button>
            </div>
          )}
          <ul id={listboxId} className="search-overlay__recent" role="listbox">
            {idleOptions.map((o, i) => {
              const startsSuggestions =
                o.kind === 'suggestion' && (i === 0 || idleOptions[i - 1].kind !== 'suggestion');
              return (
                <Fragment key={`${o.kind}:${o.label}`}>
                  {startsSuggestions && (
                    <li role="presentation" className="search-overlay__group">
                      {t('Popular searches', 'عمليات بحث شائعة')}
                    </li>
                  )}
                  <li role="presentation">
                    <button
                      type="button"
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === activeIndex}
                      data-active={i === activeIndex || undefined}
                      className="search-overlay__recent-item"
                      onMouseMove={() => setActiveIndex(i)}
                      onClick={() => setTerm(o.label)}
                    >
                      <Icon as={o.kind === 'recent' ? Clock : Sparkles} size={14} />
                      <span>{o.label}</span>
                    </button>
                  </li>
                </Fragment>
              );
            })}
          </ul>
        </div>
      )}

      {phase === 'idle' && (
        <p className="search-overlay__hint">
          {isAr
            ? 'اكتب حرفين على الأقل للبحث في الكتالوج.'
            : 'Type at least 2 characters to search the catalogue.'}
        </p>
      )}

      {phase === 'searching' && (
        <p className="search-overlay__hint" aria-live="polite">
          {isAr ? 'جارٍ البحث…' : 'Searching…'}
        </p>
      )}

      {phase === 'error' && (
        <p className="search-overlay__hint" role="alert">
          {isAr ? 'تعذّر البحث. حاول مرة أخرى.' : "Couldn't run that search. Try again."}
        </p>
      )}

      {phase === 'empty' && (
        <p className="search-overlay__hint" aria-live="polite">
          {isAr ? `لا نتائج لـ «${rawQuery}».` : `No products match “${rawQuery}”.`}
        </p>
      )}

      {phase === 'results' && (
        <div aria-live="polite">
          <ul id={listboxId} className="search-overlay__results" role="listbox">
            {items.map((product, i) => {
              const name = isAr ? product.nameAr : product.nameEn;
              const image = product.images.find((img) => !img.color) ?? product.images[0];
              return (
                <li key={product.id} role="presentation">
                  <Link
                    href={`/${locale}/product/${product.id}`}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === activeIndex}
                    data-active={i === activeIndex || undefined}
                    className="search-overlay__result"
                    onMouseMove={() => setActiveIndex(i)}
                    onClick={() => {
                      commitQuery();
                      onClose();
                    }}
                  >
                    <span className="search-overlay__result-thumb" aria-hidden>
                      {image && <CatalogImage src={image.url} alt="" fill sizes="48px" />}
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
          {extra > 0 && data && (
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
