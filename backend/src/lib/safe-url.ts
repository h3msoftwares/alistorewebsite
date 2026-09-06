import { z } from 'zod';

/**
 * True only for an absolute `http:` / `https:` URL.
 *
 * `new URL()` (and Zod's `.url()`) happily parse `javascript:alert(1)`,
 * `data:text/html,…`, `vbscript:…` and the like. Any of those, once stored
 * and later rendered as an `<a href>` on the storefront (the footer social /
 * contact links), is a stored-XSS payload. Every URL that can reach an
 * anchor must go through this.
 */
export function isHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'http:' || url.protocol === 'https:';
}

/** A trimmed, absolute `http(s)` URL — the safe replacement for `z.string().url()`
 *  on any field whose value is later rendered as a link. */
export const httpUrl = z
  .string()
  .trim()
  .refine(isHttpUrl, { message: 'Must be an http(s) URL' });
