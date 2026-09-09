'use client';

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { GripVertical } from 'lucide-react';
import { Icon } from '@/components/ui';

export interface ReorderItem {
  /** Stable identity — also what `onReorder` returns, in the new order. */
  key: string;
  content: ReactNode;
}

/**
 * Vertical drag-to-reorder list built on pointer events (no library). Grab a
 * row by its handle and the list reflows live; `onReorder` fires on drop with
 * the final key order. It re-syncs to `items` whenever the incoming order or
 * membership changes — so the persisted reorder (or an edit elsewhere) lands
 * cleanly, and the drag result is held on screen until then.
 */
export function ReorderList({
  items,
  onReorder,
  handleLabel = 'Drag to reorder',
  ariaLabel,
}: {
  items: ReorderItem[];
  onReorder: (orderedKeys: string[]) => void;
  handleLabel?: string;
  ariaLabel?: string;
}) {
  const incoming = items.map((i) => i.key);
  const [order, setOrder] = useState<string[]>(incoming);
  const [seen, setSeen] = useState(incoming.join(' '));
  const sig = incoming.join(' ');
  if (sig !== seen) {
    // Incoming order/membership changed — adopt it. Adjusting state during
    // render is the documented alternative to a re-sync effect.
    setSeen(sig);
    setOrder(incoming);
  }

  const byKey = new Map(items.map((i) => [i.key, i]));
  const rows = order.map((k) => byKey.get(k)).filter((x): x is ReorderItem => Boolean(x));

  const els = useRef(new Map<string, HTMLLIElement>());
  // Only ever written inside pointer handlers (never during render).
  const dragKey = useRef<string | null>(null);
  const liveOrder = useRef<string[]>(order);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const beginDrag = (key: string, currentOrder: string[]) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragKey.current = key;
    liveOrder.current = currentOrder;
    setActiveKey(key);
    const li = (e.currentTarget as HTMLElement).closest('li');
    try {
      li?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragKey.current) return;
    for (const [k, el] of els.current) {
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom) continue;
      const dk = dragKey.current;
      if (k === dk) return;
      const cur = liveOrder.current;
      const from = cur.indexOf(dk);
      const to = cur.indexOf(k);
      if (from < 0 || to < 0 || from === to) return;
      const next = cur.slice();
      next.splice(from, 1);
      next.splice(to, 0, dk);
      liveOrder.current = next;
      setOrder(next);
      return;
    }
  };

  const endDrag = (e: ReactPointerEvent) => {
    if (!dragKey.current) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* wasn't captured */
    }
    dragKey.current = null;
    setActiveKey(null);
    if (liveOrder.current.join(' ') !== seen) onReorder(liveOrder.current);
  };

  return (
    <ul className="reorder-list" aria-label={ariaLabel}>
      {rows.map((row) => (
        <li
          key={row.key}
          ref={(el) => {
            if (el) els.current.set(row.key, el);
            else els.current.delete(row.key);
          }}
          className="reorder-list__row"
          data-dragging={activeKey === row.key || undefined}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span
            className="reorder-list__handle"
            title={handleLabel}
            onPointerDown={beginDrag(row.key, order)}
          >
            <Icon as={GripVertical} size={16} aria-label={handleLabel} />
          </span>
          <div className="reorder-list__content">{row.content}</div>
        </li>
      ))}
    </ul>
  );
}
