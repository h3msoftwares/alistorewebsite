'use client';

import { useEffect, useState, type CSSProperties } from 'react';

type RevealTuple = [
  /** Callback ref — pass to the element's `ref` prop. */
  setRef: (node: HTMLElement | null) => void,
  /** `reveal` before the element enters the viewport, `reveal is-visible` after. */
  className: string,
  /** Carries `transition-delay` when `delayMs` was passed (staggering a group). */
  style: CSSProperties | undefined,
];

/**
 * Scroll-into-view reveal. Attach the returned ref / className / style to an
 * element and it fades + rises in the first time it enters the viewport
 * (one-shot). The motion itself is pure CSS (`.reveal` in globals.css), gated
 * behind `prefers-reduced-motion: no-preference` — reduced-motion users just
 * get the content with no hidden start state.
 *
 * `delayMs` staggers a group (e.g. a row of tiles) via `transition-delay`.
 */
export function useReveal(delayMs = 0): RevealTuple {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!node || shown) return;

    if (typeof IntersectionObserver === 'undefined') {
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    );
    io.observe(node);
    // Failsafe: never leave content hidden if the observer somehow never fires.
    const failsafe = setTimeout(() => setShown(true), 2000);
    return () => {
      io.disconnect();
      clearTimeout(failsafe);
    };
  }, [node, shown]);

  return [
    setNode,
    shown ? 'reveal is-visible' : 'reveal',
    delayMs ? { transitionDelay: `${delayMs}ms` } : undefined,
  ];
}
