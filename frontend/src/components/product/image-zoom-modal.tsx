'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { X } from 'lucide-react';
import { CatalogImage, Icon } from '@/components/ui';

export interface ImageZoomModalProps {
  open: boolean;
  onClose: () => void;
  src: string;
  alt: string;
  closeLabel: string;
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Click-to-zoom modal for the PDP main image. Same focus-trap / Esc-to-close
 * / scroll-lock / focus-restore mechanics as Drawer, but a single centered
 * panel instead of a slide-in side panel — no size-of-side or RTL slide
 * direction to get right, so it's simpler to keep correct under RTL than a
 * hover lens would be.
 *
 * Zoom itself: clicking the image toggles between "fit" and a fixed 2x scale
 * centered on the click point (works identically for a mouse click or a
 * touch tap, so there's no separate mobile behaviour to design for).
 */
export function ImageZoomModal({ open, onClose, src, alt, closeLabel }: ImageZoomModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');

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

  // Never carry a zoomed-in view over to the next time the modal opens (a
  // different image, or the same one reopened).
  useEffect(() => {
    if (!open) setZoomed(false);
  }, [open, src]);

  if (!open) return null;

  const handleFrameClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!zoomed) {
      const rect = e.currentTarget.getBoundingClientRect();
      setOrigin(`${((e.clientX - rect.left) / rect.width) * 100}% ${((e.clientY - rect.top) / rect.height) * 100}%`);
    }
    setZoomed((z) => !z);
  };

  return (
    <div className="zoom-modal" onKeyDown={handleKeyDown}>
      <div className="zoom-modal__scrim" onClick={onClose} />
      <div className="zoom-modal__panel" ref={panelRef} role="dialog" aria-modal="true" aria-label={alt}>
        <button type="button" className="icon-btn zoom-modal__close" onClick={onClose} aria-label={closeLabel}>
          <Icon as={X} />
        </button>
        <div className="zoom-modal__frame" data-zoomed={zoomed || undefined} onClick={handleFrameClick}>
          <CatalogImage
            src={src}
            alt={alt}
            fill
            sizes="92vw"
            className="zoom-modal__image"
            style={{ transformOrigin: origin }}
          />
        </div>
      </div>
    </div>
  );
}
