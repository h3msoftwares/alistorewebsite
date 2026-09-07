'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import {
  getConsentChoice,
  getConsentSnapshot,
  isConsentSettingsOpen,
  setConsentChoice,
  subscribeConsent,
} from '@/lib/consent';

// `false` on the server and the hydration render, `true` afterwards — the
// choice lives in localStorage, so gating render on this avoids a mismatch
// and a first-paint flash of the banner for shoppers who already chose.
const subscribeHydrate = () => () => {};
const useHydrated = () => useSyncExternalStore(subscribeHydrate, () => true, () => false);

/**
 * First-visit cookie banner with a real choice: "Accept All" or
 * "Necessary Only". Shown until a choice is stored, and again whenever the
 * footer's "Cookie preferences" link re-opens it. Fixed to the bottom of the
 * viewport; it never blocks interaction with the page behind it.
 */
export function CookieConsent({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const hydrated = useHydrated();
  useSyncExternalStore(subscribeConsent, getConsentSnapshot, () => 'none:closed');

  if (!hydrated) return null;
  if (getConsentChoice() !== null && !isConsentSettingsOpen()) return null;

  return (
    <div
      className="cookie-consent"
      role="region"
      aria-label={t('Cookie choices', 'خيارات ملفات تعريف الارتباط')}
    >
      <div className="cookie-consent__inner">
        <p className="cookie-consent__text">
          {t(
            'Necessary cookies keep this site working — sign-in, your cart, and language. With your OK we would also use optional cookies to measure traffic and improve the store.',
            'ملفات تعريف الارتباط الضرورية تُبقي الموقع يعمل — تسجيل الدخول، وسلّتك، واللغة. وبموافقتك سنستخدم أيضًا ملفات اختيارية لقياس الزيارات وتحسين المتجر.',
          )}{' '}
          <Link className="cookie-consent__link" href={`/${locale}/privacy`}>
            {t('Privacy Policy', 'سياسة الخصوصية')}
          </Link>
        </p>
        <div className="cookie-consent__actions">
          <Button variant="ghost" size="sm" onClick={() => setConsentChoice('necessary')}>
            {t('Necessary Only', 'الضرورية فقط')}
          </Button>
          <Button variant="primary" size="sm" onClick={() => setConsentChoice('all')}>
            {t('Accept All', 'قبول الكل')}
          </Button>
        </div>
      </div>
    </div>
  );
}
