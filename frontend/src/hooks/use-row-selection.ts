'use client';

import { useCallback, useMemo, useState } from 'react';

/**
 * Generic checkbox-selection state for a table page (bulk actions). Not
 * tied to any one entity — pass the current page's row ids and this drops
 * any previously-selected id that's no longer present (a page change, a
 * search, or the row getting archived/deleted) instead of leaving a stale,
 * invisible selection behind.
 */
export function useRowSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const idSet = useMemo(() => new Set(ids), [ids]);
  const effective = useMemo(() => new Set([...selected].filter((id) => idSet.has(id))), [selected, idSet]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const allSelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  }, [ids]);

  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    selected: effective,
    toggle,
    toggleAll,
    clear,
    count: effective.size,
    allSelected: ids.length > 0 && ids.every((id) => effective.has(id)),
  };
}
