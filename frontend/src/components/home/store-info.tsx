'use client';

import { MapPin } from 'lucide-react';
import { Icon } from '@/components/ui';
import { useSettings } from '@/hooks/use-settings';
import { useReveal } from '@/hooks/use-reveal';
import type { StoreLocation } from '@/lib/types';

/** Defence in depth for the admin-set map link — only ever emit an `<a href>`
 *  for an absolute http(s) URL (mirrors site-footer's `safeHttpUrl`). */
function safeHttpUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? value : undefined;
  } catch {
    return undefined;
  }
}

// dayOfWeek 0 = Monday … 6 = Sunday.
const DAY_LABELS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_LABELS_AR = ['الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت', 'الأحد'];

/** A location is worth showing once it has a name, an address, or any hours. */
function isRenderable(loc: StoreLocation): boolean {
  return Boolean(loc.nameEn || loc.nameAr || loc.addressEn || loc.addressAr || loc.hours.length > 0);
}

function LocationCard({ loc, locale }: { loc: StoreLocation; locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const name = isAr ? loc.nameAr : loc.nameEn;
  const address = isAr ? loc.addressAr : loc.addressEn;
  const mapUrl = safeHttpUrl(loc.mapUrl);
  const bgImage = loc.imageUrl?.trim() || null;
  const dayLabels = isAr ? DAY_LABELS_AR : DAY_LABELS_EN;
  const byDay = new Map(loc.hours.map((h) => [h.dayOfWeek, h]));

  return (
    <article
      className="store-card"
      style={bgImage ? { backgroundImage: `url(${bgImage})` } : undefined}
      data-has-image={bgImage ? '' : undefined}
    >
      <div className="store-card__body">
        <h3 className="store-card__name">{name || t('Our store', 'متجرنا')}</h3>
        {address && <p className="store-card__address">{address}</p>}
        {mapUrl && (
          <a
            className="store-card__directions"
            href={mapUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            <Icon as={MapPin} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
            {t('Get directions', 'الحصول على الاتجاهات')}
          </a>
        )}
      </div>

      {loc.hours.length > 0 && (
        <dl className="store-card__hours">
          {dayLabels.map((label, day) => {
            const entry = byDay.get(day);
            return (
              <div key={day} className="store-card__hours-row">
                <dt>{label}</dt>
                <dd>
                  {entry ? (
                    <span dir="ltr">
                      {entry.opensAt} – {entry.closesAt}
                    </span>
                  ) : (
                    <span className="store-card__closed">{t('Closed', 'مغلق')}</span>
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </article>
  );
}

/**
 * "Visit us" section near the bottom of the home page (above the footer):
 * one card per physical store — its name, address (+ optional "Get
 * directions" link) and weekly opening hours. Every field is admin-controlled
 * via /admin/settings → Store info. The whole section is omitted when no
 * location has anything to show. Each card takes an optional admin-uploaded
 * background image (with a readability scrim); with none it's a plain card.
 */
export function StoreInfo({ locale }: { locale: string }) {
  const loc = (locale === 'ar' ? 'ar' : 'en') as 'en' | 'ar';
  const isAr = loc === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const { data: settings } = useSettings();
  const [ref, revealClass, revealStyle] = useReveal();

  if (!settings) return null;
  const locations = (settings.storeLocations ?? []).filter(isRenderable);
  if (locations.length === 0) return null;

  return (
    <section
      ref={ref}
      id="visit-us"
      className={`store-info ${revealClass}`}
      style={revealStyle}
      aria-labelledby="store-info-title"
    >
      <div className="container">
        <p className="eyebrow store-info__eyebrow">{t('Visit us', 'زورونا')}</p>
        <h2 id="store-info-title" className="store-info__title">
          {locations.length > 1
            ? t('Come see us in store', 'تعالوا زورونا في متاجرنا')
            : t('Come see us in store', 'تعالوا زورونا في المتجر')}
        </h2>
        <div className="store-info__grid" data-count={locations.length}>
          {locations.map((l) => (
            <LocationCard key={l.id} loc={l} locale={loc} />
          ))}
        </div>
      </div>
    </section>
  );
}
