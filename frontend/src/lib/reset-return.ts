// A one-shot hint, persisted in localStorage, that a password reset was
// started from the signed-in account page (via the "Forgot your current
// password?" link) rather than the normal logged-out flow. The reset link
// itself arrives by email and carries no context, so this is how the
// reset-password success screen knows to send the user back to /account
// instead of showing "Go to sign in".

const KEY = 'alistore:reset-return';

/** A path we generated and trust: absolute, not protocol-relative, no
 *  backslash trick. */
function isSafePath(v: string | null | undefined): v is string {
  return typeof v === 'string' && v.length > 1 && v[0] === '/' && v[1] !== '/' && v[1] !== '\\';
}

export function rememberResetReturn(path: string): void {
  try {
    if (isSafePath(path)) window.localStorage.setItem(KEY, path);
  } catch {
    /* private mode / storage disabled — the flow still works, just no redirect */
  }
}

export function clearResetReturn(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Reads and consumes (removes) the stored return path. Returns null when
 *  there isn't a valid one. */
export function takeResetReturn(): string | null {
  try {
    const v = window.localStorage.getItem(KEY);
    window.localStorage.removeItem(KEY);
    return isSafePath(v) ? v : null;
  } catch {
    return null;
  }
}
