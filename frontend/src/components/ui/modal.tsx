'use client';

import { useCallback, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Icon } from './icon';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Used as `aria-label` when it's a plain string; otherwise the caller's
   *  own content is responsible for an accessible name (e.g. a heading with
   *  `aria-labelledby`). */
  title?: string;
  closeLabel?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Centered overlay dialog (product image zoom, etc.) — same focus-trap /
 * Esc-to-close / scroll-lock / focus-restore behaviour as `<Drawer>`, but a
 * centered card instead of a slide-in side panel, so it isn't built on top
 * of Drawer (whose CSS is written for a full-height side panel). Unlike
 * Drawer it unmounts when closed rather than staying in the DOM — a zoom
 * modal doesn't need Drawer's slide transition, so there's nothing to
 * animate out.
 */
export function Modal({ open, onClose, children, title, closeLabel = 'Close' }: ModalProps) {
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
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const id = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = overflow;
      restoreRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal" onKeyDown={handleKeyDown}>
      <div className="modal__scrim" onClick={onClose} />
      <div className="modal__panel" ref={panelRef} role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="icon-btn modal__close" onClick={onClose} aria-label={closeLabel}>
          <Icon as={X} />
        </button>
        {children}
      </div>
    </div>
  );
}
