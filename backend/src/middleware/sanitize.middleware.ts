import { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/AppError';

/**
 * Global input hardening. Runs on every JSON body (and the query string)
 * before any route handler.
 *
 *  1. Strips C0/C1 control characters and the Unicode line/paragraph
 *     separators from every string. None occur in legitimate form input
 *     and several are used to slip payloads past naive filters. NUL, in
 *     particular, can truncate a value inside downstream C libraries.
 *  2. Rejects (HTTP 400) any string containing HTML-tag syntax: a "<"
 *     immediately followed by a letter, "!", "/" or "?". The storefront
 *     stores and renders plain text only (React escapes on output, and
 *     there is no dangerouslySetInnerHTML anywhere), so nothing legitimate
 *     needs markup. "a < b" with a space still passes.
 *  3. Drops the prototype-pollution keys (__proto__, constructor,
 *     prototype) instead of copying them into the sanitized object.
 *
 * Defence-in-depth on top of output encoding - not the primary XSS control.
 * It deliberately does NOT blocklist SQL keywords: every query in the app
 * goes through Prisma or a Prisma.sql tagged template (both parameterised),
 * so "O'Brien" or "'; DROP TABLE ..." is safe data and rejecting it would
 * only break real input.
 */

// Disallowed code-point ranges (inclusive): C0 controls except TAB (0x09),
// LF (0x0A) and CR (0x0D); DEL + the C1 block; the Unicode line/paragraph
// separators U+2028 / U+2029.
const CTRL_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00, 0x08],
  [0x0b, 0x0c],
  [0x0e, 0x1f],
  [0x7f, 0x9f],
  [0x2028, 0x2029],
];

function isDisallowed(codePoint: number): boolean {
  return CTRL_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);
}

// A "<" that starts a tag, comment, closing tag or processing instruction.
const HTML_TAG_START = /<[a-zA-Z!/?]/;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const MAX_DEPTH = 20;

function scrub(value: string): string {
  let out = '';
  for (const ch of value) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && isDisallowed(cp)) continue;
    out += ch;
  }
  return out.normalize('NFC');
}

function sanitizeValue(node: unknown, path: string, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    throw new AppError('VALIDATION_ERROR', 'Request body nested too deeply');
  }

  if (typeof node === 'string') {
    const cleaned = scrub(node);
    if (HTML_TAG_START.test(cleaned)) {
      throw new AppError('VALIDATION_ERROR', `Field "${path || 'body'}" must not contain markup`);
    }
    return cleaned;
  }

  if (Array.isArray(node)) {
    return node.map((v, i) => sanitizeValue(v, `${path}[${i}]`, depth + 1));
  }

  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      out[key] = sanitizeValue(value, path ? `${path}.${key}` : key, depth + 1);
    }
    return out;
  }

  return node;
}

/** Rejects markup anywhere in the query string. Express 5 makes req.query a
 *  read-only getter, so this only inspects - the validated values downstream
 *  come from Zod via req.validatedQuery. */
function assertQueryClean(query: unknown, path: string, depth: number): void {
  if (depth > MAX_DEPTH) return;
  if (typeof query === 'string') {
    if (HTML_TAG_START.test(query)) {
      throw new AppError('VALIDATION_ERROR', `Query "${path}" must not contain markup`);
    }
    return;
  }
  if (Array.isArray(query)) {
    query.forEach((v, i) => assertQueryClean(v, `${path}[${i}]`, depth + 1));
    return;
  }
  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      assertQueryClean(value, path ? `${path}.${key}` : key, depth + 1);
    }
  }
}

export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {
  try {
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeValue(req.body, '', 0);
    }
    assertQueryClean(req.query, '', 0);
    next();
  } catch (err) {
    next(err);
  }
}
