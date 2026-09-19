'use client';

import { Trash2 } from 'lucide-react';
import { CatalogImage, Icon, Select } from '@/components/ui';
import { ImageUploader } from './image-uploader';
import { hexColorLabel } from '@/lib/product-variants';
import type { UploadedImage } from '@/lib/imagekit-upload';

export interface GalleryImage {
  id: string;
  url: string;
  /** ImageKit's file id — threaded through so deleting this row also cleans
   *  up the underlying ImageKit asset (see the backend's image-cleanup
   *  service). `null`/absent on images uploaded before this field existed. */
  fileId?: string | null;
  altEn?: string | null;
  altAr?: string | null;
  /** Product images only — which colour option this photo belongs to.
   *  `null`/absent = shown for every colour. Ignored (and the colour picker
   *  hidden) unless `colorOptions` is passed. */
  color?: string | null;
}

/**
 * Existing images (thumbnail + optional colour tag + remove) plus an
 * uploader to add more — the shared building block behind every admin
 * form's image management (collections, categories, products). Deliberately
 * dumb: it doesn't know about collections/categories/products, just calls
 * back with an uploaded {url, fileId} to add or an id to remove; the caller
 * wires those to the right add/update/delete-image mutation.
 */
export function ImageGallery({
  images,
  onAdd,
  onDelete,
  onColorChange,
  colorOptions,
  folder,
  locale = 'en',
  isDeleting,
}: {
  images: GalleryImage[];
  onAdd: (image: UploadedImage) => void;
  onDelete: (imageId: string) => void;
  /** Present only for product images — omit entirely for collections/categories. */
  onColorChange?: (imageId: string, color: string | null) => void;
  colorOptions?: string[];
  folder?: string;
  locale?: 'en' | 'ar';
  isDeleting?: (imageId: string) => boolean;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  return (
    <div className="image-gallery">
      {images.length > 0 && (
        <ul className="image-gallery__grid" role="list">
          {images.map((img) => (
            <li key={img.id} className="image-gallery__item">
              <div className="image-gallery__thumb">
                <CatalogImage src={img.url} alt={(isAr ? img.altAr : img.altEn) ?? ''} fill sizes="120px" />
              </div>

              {colorOptions && colorOptions.length > 0 && (
                <Select
                  className="image-gallery__color"
                  aria-label={t('Colour for this image', 'اللون لهذه الصورة')}
                  value={img.color ?? ''}
                  onChange={(e) => onColorChange?.(img.id, e.target.value || null)}
                >
                  <option value="">{t('Generic (all colours)', 'عام (كل الألوان)')}</option>
                  {colorOptions.map((c) => (
                    <option key={c} value={c}>
                      {hexColorLabel(c, locale)}
                    </option>
                  ))}
                </Select>
              )}

              <button
                type="button"
                className="icon-btn icon-btn--bordered image-gallery__remove"
                onClick={() => onDelete(img.id)}
                disabled={isDeleting?.(img.id)}
                aria-label={t('Remove image', 'حذف الصورة')}
              >
                <Icon as={Trash2} size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ImageUploader folder={folder} locale={locale} onUploaded={onAdd} />
    </div>
  );
}
