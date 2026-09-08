'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Icon } from '@/components/ui';

// Drag-to-scroll is mouse-only (React's MouseEvent, not PointerEvent) —
// touch already gets native, momentum-based scrolling from `overflow-x:
// auto`, which is smoother than anything a manual JS drag would produce.
const DRAG_THRESHOLD_PX = 4;

/**
 * One horizontally-scrollable row: a small title header, then a viewport
 * with prev/next arrows overlaid directly on the track (vertically centered
 * on the content, not floating in the header) so they read as controls for
 * *this* row of tiles. The track scrolls via touch swipe (native), mouse
 * wheel/trackpad (native), or a mouse click-and-drag (added here, since the
 * scrollbar is hidden and a plain mouse has no other way to drag it). Used
 * for both a collection's row of categories and a category's row of
 * products (see `CollectionRow` / `CategoryRow`) — this component only owns
 * the scroll mechanics and chrome, not what's inside.
 *
 * RTL: arrow *meaning* stays "toward reading start" / "toward reading end" in
 * both directions — the icons mirror via `flipRtl` and the scroll amount's
 * sign flips with the track's computed `direction`, so "next" always reveals
 * the next items regardless of locale.
 */
export function HorizontalScroller({
  title,
  titleHref,
  ariaLabel,
  locale,
  className,
  children,
}: {
  title: string;
  titleHref?: string;
  ariaLabel: string;
  locale: string;
  /** Extra class on the outer `.home-row` section (for per-use tile sizing). */
  className?: string;
  children: ReactNode;
}) {
  const isAr = locale === 'ar';
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateBounds = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    // abs(scrollLeft) is "distance travelled from the natural start" in both
    // the LTR and the (negative-range) RTL scrollLeft conventions — sidesteps
    // branching on direction for the boundary check.
    const travelled = Math.abs(el.scrollLeft);
    setCanPrev(travelled > 1);
    setCanNext(travelled < maxScroll - 1);
  }, []);

  useEffect(() => {
    updateBounds();
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateBounds);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateBounds]);

  const scrollBy = (toward: 'prev' | 'next') => {
    const el = trackRef.current;
    if (!el) return;
    const isRtl = getComputedStyle(el).direction === 'rtl';
    const step = el.clientWidth * 0.85 * (toward === 'next' ? 1 : -1) * (isRtl ? -1 : 1);
    el.scrollBy({ left: step, behavior: 'smooth' });
  };

  // Mouse click-and-drag scrolling. `moved` tracks whether the pointer
  // travelled far enough to count as a drag rather than a click, so a real
  // drag doesn't also fire the tile's <Link> navigation underneath it.
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false });

  const onMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el || e.button !== 0) return;
    drag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false };
  };
  const onMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    const d = drag.current;
    if (!d.active || !el) return;
    const delta = e.clientX - d.startX;
    if (Math.abs(delta) > DRAG_THRESHOLD_PX) d.moved = true;
    if (!d.moved) return;
    // Content should track the cursor 1:1. In LTR that means scrollLeft
    // moves opposite the drag (drag right → scrollLeft decreases); RTL's
    // negative-range scrollLeft convention flips that — same sign flip as
    // the arrow buttons' scrollBy (see the RTL note on the component).
    const isRtl = getComputedStyle(el).direction === 'rtl';
    el.scrollLeft = d.startScroll + (isRtl ? delta : -delta);
  };
  const endDrag = () => {
    drag.current.active = false;
  };
  // Capture phase: swallow the click that would otherwise follow a drag,
  // before it reaches a tile's <Link>. A plain click (no real movement)
  // passes through untouched.
  const onClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
    drag.current.moved = false;
  };

  return (
    <section className={className ? `home-row ${className}` : 'home-row'} aria-label={ariaLabel}>
      <div className="container">
        <header className="home-row__head">
          {titleHref ? (
            <Link href={titleHref} className="home-row__title">
              {title}
            </Link>
          ) : (
            <h2 className="home-row__title">{title}</h2>
          )}
        </header>

        <div className="home-row__viewport">
          <button
            type="button"
            className="home-row__arrow home-row__arrow--prev"
            onClick={() => scrollBy('prev')}
            disabled={!canPrev}
            aria-label={isAr ? 'السابق' : 'Previous'}
          >
            <Icon as={ChevronLeft} flipRtl size={18} />
          </button>

          <div
            className="home-row__track"
            ref={trackRef}
            onScroll={updateBounds}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={endDrag}
            onMouseLeave={endDrag}
            onClickCapture={onClickCapture}
            onDragStart={(e) => e.preventDefault()}
          >
            {children}
          </div>

          <button
            type="button"
            className="home-row__arrow home-row__arrow--next"
            onClick={() => scrollBy('next')}
            disabled={!canNext}
            aria-label={isAr ? 'التالي' : 'Next'}
          >
            <Icon as={ChevronRight} flipRtl size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
