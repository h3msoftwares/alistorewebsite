'use client';

import { useId, useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { Icon } from '@/components/ui';
import { uploadImage, type UploadedImage } from '@/lib/imagekit-upload';

/** File picker that uploads straight to ImageKit and hands the resulting
 *  {url, fileId} back — it doesn't know or care what resource the image
 *  belongs to; the caller wires `onUploaded` to the right add-image
 *  mutation (fileId lets that image be cleaned up from ImageKit later, see
 *  the backend's image-cleanup.service). See `<ImageGallery>` for the
 *  list-existing + upload-new combination used by the admin forms. */
export function ImageUploader({
  folder,
  onUploaded,
  locale = 'en',
  disabled = false,
}: {
  folder?: string;
  onUploaded: (image: UploadedImage) => void;
  locale?: 'en' | 'ar';
  disabled?: boolean;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setError(null);
    setIsUploading(true);
    try {
      const uploaded = await uploadImage(file, { folder });
      onUploaded(uploaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Upload failed', 'فشل الرفع'));
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const busy = disabled || isUploading;

  return (
    <div className="image-uploader">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        className="visually-hidden"
        onChange={(e) => void handleFiles(e.target.files)}
        disabled={busy}
      />
      <label htmlFor={inputId} className="btn btn--outline btn--sm image-uploader__trigger" data-disabled={busy || undefined}>
        <Icon as={UploadCloud} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
        {isUploading ? t('Uploading…', 'جارٍ الرفع…') : t('Upload image', 'رفع صورة')}
      </label>
      {error && (
        <p className="image-uploader__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
