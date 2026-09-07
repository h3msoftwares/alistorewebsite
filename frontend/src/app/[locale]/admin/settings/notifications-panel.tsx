'use client';

import { Alert, Button, Skeleton } from '@/components/ui';
import { usePushNotifications } from '@/hooks/use-push-notifications';

/**
 * "Enable order alerts on this device" — a per-browser, per-admin opt-in for
 * Web Push new-order notifications (see backend/src/lib/push.ts). Not part
 * of the SiteSettings form above it: this is a device preference, not
 * store-wide config, so it has its own state and its own save path
 * (POST/DELETE /api/admin/push-subscriptions) rather than going through
 * useUpdateSettings.
 */
export function NotificationsPanel({ locale }: { locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { state, busy, error, subscribe, unsubscribe } = usePushNotifications();

  if (state === null) {
    return <Skeleton variant="line" style={{ maxWidth: '24rem' }} />;
  }

  return (
    <div className="stack" style={{ maxWidth: '32rem' }}>
      <p className="prose">
        {t(
          'Get a push notification on this browser when a new order comes in — in addition to the owner email alert, not instead of it.',
          'احصل على إشعار فوري على هذا المتصفح عند وصول طلب جديد — بالإضافة إلى تنبيه البريد الإلكتروني، وليس بديلاً عنه.'
        )}
      </p>

      {error && <Alert tone="danger">{error}</Alert>}

      {state === 'unsupported' && (
        <Alert tone="warning">
          {t(
            "This browser doesn't support push notifications (Safari on iPhone/iPad only supports this after adding the site to the home screen).",
            'هذا المتصفح لا يدعم الإشعارات الفورية (متصفح سفاري على آيفون/آيباد يدعمها فقط بعد إضافة الموقع إلى الشاشة الرئيسية).'
          )}
        </Alert>
      )}

      {state === 'blocked' && (
        <Alert tone="warning">
          {t(
            'Notifications are blocked for this site in your browser. Re-enable them in your browser’s site settings, then reload this page.',
            'الإشعارات محظورة لهذا الموقع في متصفحك. أعد تفعيلها من إعدادات الموقع في المتصفح، ثم أعد تحميل هذه الصفحة.'
          )}
        </Alert>
      )}

      {state === 'off' && (
        <Button type="button" onClick={() => void subscribe()} loading={busy}>
          {t('Enable order alerts on this device', 'تفعيل تنبيهات الطلبات على هذا الجهاز')}
        </Button>
      )}

      {state === 'on' && (
        <>
          <Alert tone="success">{t('Order alerts are on for this device.', 'تنبيهات الطلبات مفعّلة على هذا الجهاز.')}</Alert>
          <Button type="button" variant="ghost" onClick={() => void unsubscribe()} loading={busy}>
            {t('Turn off on this device', 'إيقاف على هذا الجهاز')}
          </Button>
        </>
      )}
    </div>
  );
}
