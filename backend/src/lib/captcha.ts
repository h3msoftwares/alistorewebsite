import { env } from '../config/env';

const SITEVERIFY_URL = 'https://api.hcaptcha.com/siteverify';

/**
 * Verifies an hCaptcha response token server-side. Never throws — a network
 * error or malformed response is treated as a failed verification (fail
 * closed), since the whole point is to block a request when we can't prove
 * it's human.
 */
export async function verifyCaptcha(token: string, remoteIp?: string): Promise<boolean> {
  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret: env.HCAPTCHA_SECRET, response: token });
    if (remoteIp) body.set('remoteip', remoteIp);

    const res = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return false;

    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error('[captcha] hCaptcha siteverify request failed', err);
    return false;
  }
}
