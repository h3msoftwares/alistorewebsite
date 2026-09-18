'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useLogout } from '@/hooks/use-auth';
import { Icon } from '@/components/ui/icon';

/**
 * Sign-out control, used from the menu drawer and the account page. Self
 * contained on purpose — it's the only new touch point in the shared Topbar
 * (one import + one line), to keep merges with main conflict-free.
 *
 * `useLogout` already clears the token, the Redux session, the cart badge and
 * the query cache; this just fires it and sends the browser to the locale
 * home so the user doesn't linger on an authed-only page.
 */
export function LogoutButton({
  locale,
  variant = 'button',
  onDone,
  labelEn = 'Log out',
  labelAr = 'تسجيل الخروج',
}: {
  locale: string;
  /** `nav` = styled as a drawer nav link; `button` = a regular outline button;
   *  `icon` = bare icon button, for the dark admin sidebar; `admin-nav` = a
   *  full-width row matching `.admin-sidebar__link`, for the admin mobile
   *  "More" drawer. */
  variant?: 'nav' | 'button' | 'icon' | 'admin-nav';
  /** Called right before the redirect — e.g. to close the menu drawer. */
  onDone?: () => void;
  labelEn?: string;
  labelAr?: string;
}) {
  const router = useRouter();
  const logout = useLogout();
  const label = locale === 'ar' ? labelAr : labelEn;

  const onClick = async () => {
    try {
      await logout.mutateAsync();
    } catch {
      // logout is best-effort — useLogout still clears local state onSettled
    } finally {
      onDone?.();
      router.replace(`/${locale}`);
    }
  };

  if (variant === 'icon') {
    return (
      <button
        type="button"
        className="admin-sidebar__logout"
        disabled={logout.isPending}
        onClick={onClick}
        title={label}
        aria-label={label}
      >
        <Icon as={LogOut} size={16} />
      </button>
    );
  }

  if (variant === 'admin-nav') {
    return (
      <button
        type="button"
        className="admin-sidebar__link"
        disabled={logout.isPending}
        onClick={onClick}
        style={{ font: 'inherit', background: 'none', border: 0, width: '100%', textAlign: 'start', cursor: 'pointer' }}
      >
        <Icon as={LogOut} size={18} />
        {label}
      </button>
    );
  }

  if (variant === 'nav') {
    return (
      <button
        type="button"
        className="drawer__nav-link"
        disabled={logout.isPending}
        onClick={onClick}
        // reset the <button> so it reads like the sibling <Link>s; kept inline
        // so no shared stylesheet is touched
        style={{
          font: 'inherit',
          color: 'inherit',
          background: 'none',
          borderInline: 0,
          borderBlockStart: 0,
          textAlign: 'start',
          width: '100%',
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <button type="button" className="btn btn--outline btn--sm" disabled={logout.isPending} onClick={onClick}>
      {label}
    </button>
  );
}
