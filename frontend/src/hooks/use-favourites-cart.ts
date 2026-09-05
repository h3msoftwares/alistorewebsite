'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAddManyToCart } from '@/hooks/use-cart';
import { firstPurchasableVariant } from '@/lib/product-variants';
import type { Product } from '@/lib/types';

export interface FavouritesCartSelection {
  /** productId → the variant id "Add to cart" would use. Only products with a
   *  variant actually in stock appear here. */
  purchasable: ReadonlyMap<string, string>;
  /** Ids of favourites that can be added right now (have `purchasable` entry). */
  addableIds: string[];
  /** Ticked product ids (may include ids no longer addable if stock changed — the
   *  bulk add filters to `addableIds` at send time). */
  selectedCount: number;
  allSelected: boolean;
  isSelected: (productId: string) => boolean;
  toggleOne: (productId: string) => void;
  toggleAll: () => void;
  /** Add every ticked-and-addable favourite to the cart. Resolves once done;
   *  succeeded rows are auto-unticked and `summary` is set. No-op when nothing
   *  addable is ticked. */
  addSelectedToCart: () => Promise<void>;
  isAdding: boolean;
  /** Outcome of the last bulk add — `null` until one runs. */
  summary: { added: number; failed: number } | null;
}

/**
 * Selection + "move to cart" logic shared by the favourites drawer and the
 * favourites page. Favourites are product-level, so a product's add target is
 * its first in-stock variant (see `firstPurchasableVariant`); products with no
 * stock are simply not addable/selectable.
 */
export function useFavouritesCart(favourites: Product[]): FavouritesCartSelection {
  const addMany = useAddManyToCart();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [summary, setSummary] = useState<{ added: number; failed: number } | null>(null);

  const purchasable = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of favourites) {
      const v = firstPurchasableVariant(p.variants);
      if (v && v.stockQuantity > 0) map.set(p.id, v.id);
    }
    return map;
  }, [favourites]);

  const addableIds = useMemo(
    () => favourites.map((p) => p.id).filter((id) => purchasable.has(id)),
    [favourites, purchasable],
  );

  const allSelected = addableIds.length > 0 && addableIds.every((id) => selected.has(id));
  const selectedCount = addableIds.filter((id) => selected.has(id)).length;

  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  const toggleOne = useCallback(
    (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  const toggleAll = useCallback(
    () => setSelected(allSelected ? new Set() : new Set(addableIds)),
    [allSelected, addableIds],
  );

  const addSelectedToCart = useCallback(async () => {
    const lines = addableIds
      .filter((id) => selected.has(id))
      .map((id) => ({ variantId: purchasable.get(id)!, key: id }));
    if (lines.length === 0) return;

    setSummary(null);
    const results = await addMany.mutateAsync(lines);
    const okIds = new Set(results.filter((r) => r.ok).map((r) => r.key));
    setSummary({
      added: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    });
    // Keep the failures ticked so it's obvious what didn't go through.
    setSelected((prev) => new Set([...prev].filter((id) => !okIds.has(id))));
  }, [addableIds, selected, purchasable, addMany]);

  return {
    purchasable,
    addableIds,
    selectedCount,
    allSelected,
    isSelected,
    toggleOne,
    toggleAll,
    addSelectedToCart,
    isAdding: addMany.isPending,
    summary,
  };
}
