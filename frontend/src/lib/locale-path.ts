/** Swaps the leading `/en`/`/ar` locale segment of an app pathname, keeping
 *  the rest of the path — so a language switch (e.g. in the admin panel)
 *  stays on the same page instead of bouncing to some fixed landing route. */
export function swapLocalePath(pathname: string, targetLocale: 'en' | 'ar'): string {
  const rest = pathname.replace(/^\/(en|ar)(?=\/|$)/, '');
  return `/${targetLocale}${rest}`;
}
