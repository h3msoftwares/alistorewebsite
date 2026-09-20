'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MoreVertical, type LucideIcon } from 'lucide-react';
import { Icon } from './icon';

export interface RowAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

/**
 * Generic overflow ("kebab") menu for a table row's secondary actions —
 * nothing like this existed before; row actions used to be hand-rolled as a
 * row of icon buttons on every list page. Closes on outside-click/Esc, like
 * the existing `Modal`/`Drawer`.
 */
export function RowActionsMenu({ actions, label = 'More actions' }: { actions: RowAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'down' | 'up'>('down');
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Flip the menu above its trigger when opening it downward (the default)
  // would render it past the bottom of the viewport — a row near the end of
  // a long table/page, previously left invisible below the fold until the
  // page was scrolled further down. Measured before paint so there's no
  // visible downward-then-upward jump. No reset-on-close branch needed:
  // `placement` is irrelevant while the menu is unmounted and gets freshly
  // recomputed from a real measurement on every reopen.
  useLayoutEffect(() => {
    if (!open) return;
    const rect = menuRef.current?.getBoundingClientRect();
    setPlacement(rect && rect.bottom > window.innerHeight ? 'up' : 'down');
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div className="row-actions" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon as={MoreVertical} size={18} />
      </button>
      {open && (
        <div className="row-actions__menu" data-placement={placement} ref={menuRef} role="menu">
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              className="row-actions__item"
              data-tone={a.tone}
              disabled={a.disabled}
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
            >
              <Icon as={a.icon} size={16} />
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
