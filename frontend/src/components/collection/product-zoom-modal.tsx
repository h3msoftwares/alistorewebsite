'use client';

import { useState, type MouseEvent } from 'react';
import { CatalogImage, Modal } from '@/components/ui';
import type { ProductImage } from '@/lib/types';

const ZOOM_SCALE = 2.2;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/**
 * The "magnifier" — a centered modal showing a product's current photo (the
 * same one the listing card has selected, respecting any colour swatch
 * choice) with a click-to-zoom interaction: click/tap the image to zoom in
 * on that point, move the mouse to pan around while zoomed, click again to
 * zoom back out. Deliberately a single image, not a gallery: the listing
 * card already has its own colour-swatch/photo-swap control feeding `image`
 * in — this modal just shows that photo bigger.
 *
 * The parent remounts this (via a changing `key`) each time it opens, so
 * `zoomed`/`origin` always start fresh rather than resuming a stale zoom
 * from the last time this was open — cheaper and simpler than an effect
 * that resets state on close.
 */
export function ProductZoomModal({
  open,
  onClose,
  image,
  name,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  image?: Pick<ProductImage, 'url' | 'altEn' | 'altAr'>;
  name: string;
  locale: 'en' | 'ar';
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });

  const originFromEvent = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  };

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    setOrigin(originFromEvent(e));
    setZoomed((z) => !z);
  };

  const handleMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
    if (!zoomed) return;
    setOrigin(originFromEvent(e));
  };

  return (
    <Modal open={open} onClose={onClose} title={name} closeLabel={isAr ? 'إغلاق' : 'Close'}>
      <div className="product-zoom-modal">
        {image ? (
          <button
            type="button"
            className="product-zoom-modal__media"
            data-zoomed={zoomed || undefined}
            onClick={handleClick}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setZoomed(false)}
            aria-label={zoomed ? t('Zoom out', 'تصغير') : t('Zoom in', 'تكبير')}
          >
            <CatalogImage
              src={image.url}
              alt={(isAr ? image.altAr : image.altEn) ?? name}
              fill
              sizes="(max-width: 720px) 92vw, 720px"
              priority
              style={{
                transform: zoomed ? `scale(${ZOOM_SCALE})` : 'scale(1)',
                transformOrigin: `${origin.x}% ${origin.y}%`,
              }}
            />
          </button>
        ) : (
          <div className="product-zoom-modal__media">
            <span className="catalog-image__fallback" aria-hidden />
          </div>
        )}
        <p className="product-zoom-modal__name">
          {name}
          {image && (
            <span className="product-zoom-modal__hint">
              {zoomed ? t(' — click to zoom out', ' — انقر للتصغير') : t(' — click to zoom in', ' — انقر للتكبير')}
            </span>
          )}
        </p>
      </div>
    </Modal>
  );
}
