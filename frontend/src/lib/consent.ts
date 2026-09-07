/**
 * Cookie-consent preference — a single readable flag any current or future
 * client-side script can gate on before it loads or sets a non-essential
 * cookie.
 *
 * Model: the shopper's first-visit choice is persisted in localStorage under
 * `cookieConsent` as `'all'` (Accept All) or `'necessary'` (Necessary Only).
 * Strictly-necessary cookies (auth refresh token, guest cart session, CSRF
 * token) are never gated — they are not covered by this flag at all. Only the
 * `'analytics'` category exists today; `hasConsent('analytics')` is the check
 * `<GoogleAnalytics>` uses, and anything added later should gate the same way.
 *
 * The banner (components/chrome/cookie-consent.tsx) writes the choice; the
 * footer's "Cookie preferences" link calls `openConsentSettings()` to bring
 * the banner back so the choice can be changed.
 */

export type ConsentChoice = 'all' | 'necessary';
export type ConsentCategory = 'analytics';

export const CONSENT_STORAGE_KEY = 'cookieConsent';

const listeners = new Set<() => void>();
let settingsOpen = false;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The stored choice, or `null` if the shopper hasn't chosen yet. */
export function getConsentChoice(): ConsentChoice | null {
  const raw = readRaw();
  return raw === 'all' || raw === 'necessary' ? raw : null;
}

/** Persist the choice (once, from either banner button) and notify listeners.
 *  Also closes the "review your choice" state opened from the footer. */
export function setConsentChoice(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
  } catch {
    // Private mode / storage disabled — the choice just won't survive a reload.
  }
  settingsOpen = false;
  emit();
}

/** Forget the stored choice — the banner will show again on the next render.
 *  Exposed mainly for tests and a future "reset" control. */
export function clearConsentChoice(): void {
  try {
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
  } catch {
    // ignore
  }
  emit();
}

/**
 * Whether the shopper has granted an optional cookie category. Only an
 * explicit "Accept All" grants; no choice yet, or "Necessary Only", is a
 * denial. Every non-essential script must call this before loading.
 */
export function hasConsent(category: ConsentCategory): boolean {
  void category; // one optional category today — keep the param so callers are future-proof
  return getConsentChoice() === 'all';
}

/** Re-open the banner so a returning shopper can change their choice. */
export function openConsentSettings(): void {
  settingsOpen = true;
  emit();
}

export function isConsentSettingsOpen(): boolean {
  return settingsOpen;
}

/** Subscribe to any consent change (choice made, reset, or banner re-opened).
 *  Returns an unsubscribe fn. Shape suits `useSyncExternalStore`. */
export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Primitive snapshot for `useSyncExternalStore` — changes whenever the
 *  banner's visibility could change. */
export function getConsentSnapshot(): string {
  return `${getConsentChoice() ?? 'none'}:${settingsOpen ? 'open' : 'closed'}`;
}

function emit(): void {
  for (const listener of listeners) listener();
}

// Keep tabs in sync: a choice made in one tab closes the banner in the others.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === CONSENT_STORAGE_KEY) emit();
  });
}
