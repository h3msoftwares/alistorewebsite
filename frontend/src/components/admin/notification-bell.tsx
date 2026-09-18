'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { Icon } from '@/components/ui/icon';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/hooks/use-notifications';
import type { Notification } from '@/lib/types';

/**
 * The in-panel, durable, cross-device counterpart to the opt-in Web Push
 * alerts (Settings > Notifications) — every admin/staff sees this
 * regardless of whether they ever enabled push on any device. Outside-
 * click/Esc-close logic mirrors `RowActionsMenu`'s own pattern (not reused
 * directly — the content shape here is a rich list, not a flat action menu).
 */
export function NotificationBell({ locale }: { locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unreadCount = data?.unreadCount ?? 0;
  const notifications = data?.notifications ?? [];

  const openItem = (n: Notification) => {
    if (!n.read) markRead.mutate(n.id);
    setOpen(false);
    if (n.url) router.push(n.url);
  };

  const date = (iso: string) =>
    new Date(iso).toLocaleString(isAr ? 'ar-EG' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      numberingSystem: 'latn',
    });

  return (
    <div className="notification-bell" ref={ref}>
      <span className="icon-btn-wrap">
        <button
          type="button"
          className="icon-btn notification-bell__trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={t('Notifications', 'الإشعارات')}
          onClick={() => setOpen((o) => !o)}
        >
          <Icon as={Bell} size={18} />
        </button>
        {unreadCount > 0 && <span className="icon-btn__badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </span>

      {open && (
        <div className="notification-bell__panel" role="menu">
          <div className="notification-bell__header">
            <span>{t('Notifications', 'الإشعارات')}</span>
            {unreadCount > 0 && (
              <button type="button" className="notification-bell__mark-all" onClick={() => markAllRead.mutate()}>
                {t('Mark all read', 'وضع علامة مقروء على الكل')}
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="notification-bell__empty">{t('Nothing yet.', 'لا يوجد شيء بعد.')}</p>
          ) : (
            <ul className="notification-bell__list">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="notification-bell__item"
                    data-unread={!n.read || undefined}
                    onClick={() => openItem(n)}
                  >
                    <span className="notification-bell__item-title">{n.title}</span>
                    {n.body && <span className="notification-bell__item-body">{n.body}</span>}
                    <span className="notification-bell__item-date">{date(n.dateCreated)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
