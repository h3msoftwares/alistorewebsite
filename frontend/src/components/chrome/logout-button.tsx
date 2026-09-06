'use client';

import { useRouter } from 'next/navigation';
import { useLogout } from '@/hooks/use-auth';

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
  /** `nav` = styled as a drawer nav link; `button` = a regular outline button. */
  variant?: 'nav' | 'button';
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
