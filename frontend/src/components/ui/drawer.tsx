'use client';

import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Icon } from './icon';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** `start` = menu (slides from inline-start); `end` = cart/search (from inline-end). Mirrors under RTL. */
  side?: 'start' | 'end';
  title: ReactNode;
  children: ReactNode;
  /** Localised close-button label. */
  closeLabel?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Off-canvas panel (Saxon's slide-in pattern) for the mobile menu, cart, and
 * search. Focus-trapped, Esc to close, background scroll locked, focus
 * restored to the trigger on close. Always rendered so the CSS transition can
 * play; visibility is driven by `data-open`.
 */
export function Drawer({ open, onClose, side = 'start', title, children, closeLabel = 'Close' }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    // move focus into the panel
    const id = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = overflow;
      restoreRef.current?.focus?.();
    };
  }, [open]);

  return (
    <div className={`drawer drawer--${side}`} data-open={open} aria-hidden={!open} onKeyDown={handleKeyDown}>
      <div className="drawer__scrim" onClick={onClose} />
      <div
        className="drawer__panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        <div className="drawer__header">
          <strong>{title}</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={closeLabel}>
            <Icon as={X} />
          </button>
        </div>
        <div className="drawer__body">{children}</div>
      </div>
    </div>
  );
}
