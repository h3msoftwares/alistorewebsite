'use client';

import { useSettings } from '@/hooks/use-settings';
import { DEFAULT_BRAND_NAME_AR, DEFAULT_BRAND_NAME_EN } from '@/lib/site';

/** Split admin-entered plain text into paragraphs on blank lines; single
 *  newlines inside a paragraph become <br>. */
function paragraphs(body: string): string[][] {
  return body
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split('\n'));
}

/**
 * "Our story" — an optional content page filled in from
 * /admin/settings → Our story. Title + body per language; a language with no
 * body falls back to the other. With nothing written in either language the
 * page shows a short placeholder (and the footer link is hidden — see
 * site-footer.tsx), so a stray `/our-story` visit never 404s.
 */
export function OurStoryView({ locale }: { locale: 'en' | 'ar' }) {
  const { data: settings } = useSettings();
  const ar = locale === 'ar';
  const t = (en: string, arabic: string) => (ar ? arabic : en);

  const brand = ar
    ? settings?.brandNameAr || DEFAULT_BRAND_NAME_AR
    : settings?.brandNameEn || DEFAULT_BRAND_NAME_EN;

  const body = ar
    ? settings?.storyBodyAr || settings?.storyBodyEn || ''
    : settings?.storyBodyEn || settings?.storyBodyAr || '';
  const title = ar
    ? settings?.storyTitleAr || settings?.storyTitleEn || ''
    : settings?.storyTitleEn || settings?.storyTitleAr || '';

  return (
    <div className="container section" style={{ maxWidth: '44rem' }}>
      <article className="prose" dir={ar ? 'rtl' : 'ltr'} style={{ maxWidth: 'none' }}>
        <h1>{title || t('Our story', 'قصتنا')}</h1>
        {body ? (
          paragraphs(body).map((lines, i) => (
            <p key={i}>
              {lines.map((line, j) => (
                <span key={j}>
                  {line}
                  {j < lines.length - 1 && <br />}
                </span>
              ))}
            </p>
          ))
        ) : (
          <p style={{ color: 'var(--color-text-muted)' }}>
            {t(
              `${brand} hasn’t shared its story yet — check back soon.`,
              `لم يشارك ${brand} قصته بعد — عد قريبًا.`
            )}
          </p>
        )}
      </article>
    </div>
  );
}
