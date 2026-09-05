'use client';

import { useEffect, useState } from 'react';

/**
 * The value, but only after it has stopped changing for `delayMs`. For
 * search-as-you-type and other "wait until they pause" inputs — keeps the
 * caller (a query key, an effect) from reacting on every keystroke.
 *
 * The timer is set inside an effect but `setState` only ever runs from its
 * async callback, never synchronously during the effect — so this doesn't
 * trip `react-hooks/set-state-in-effect`.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
