'use client';

import { useEffect, useRef, useState } from 'react';
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
  const ref = useRef<HTMLDivElement>(null);

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
        <div className="row-actions__menu" role="menu">
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
