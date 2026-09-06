import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { sanitizeInput } from '../../src/middleware/sanitize.middleware';
import { AppError } from '../../src/lib/AppError';

function run(body: unknown, query: unknown = {}) {
  const req = { body, query } as unknown as Request;
  const next = vi.fn();
  sanitizeInput(req, {} as Response, next);
  return { req, next, err: next.mock.calls[0]?.[0] as unknown };
}

const CH = (code: number) => String.fromCharCode(code);

describe('sanitizeInput', () => {
  it('strips NUL / control chars / line separators, keeps tab + newline', () => {
    const { req, next } = run({
      name: `Ali${CH(0)}${CH(7)} Baba${CH(127)}`,
      notes: `line1\nline2\tindented${CH(0x2028)}`,
    });
    expect(next).toHaveBeenCalledWith(); // no error
    expect(req.body).toEqual({ name: 'Ali Baba', notes: 'line1\nline2\tindented' });
  });

  it('rejects a value containing an HTML tag', () => {
    for (const bad of [
      '<script>alert(1)</script>',
      '<img src=x onerror=alert(1)>',
      '<svg/onload=alert(1)>',
      'hello <b>world</b>',
      '<!-- comment -->',
      '</div>',
    ]) {
      const { err } = run({ field: bad });
      expect(err, bad).toBeInstanceOf(AppError);
      expect((err as AppError).status).toBe(400);
    }
  });

  it('allows a bare "less than" that is not a tag', () => {
    const { req, next } = run({ note: '5 < 10 and a<3 heart', size: 'fits M < L' });
    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ note: '5 < 10 and a<3 heart', size: 'fits M < L' });
  });

  it('does NOT reject SQL-looking strings - safe data under Prisma parameterisation', () => {
    const payload = {
      name: "Robert'); DROP TABLE users;--",
      notes: '1 OR 1=1 UNION SELECT * FROM "user"',
    };
    const { req, next } = run({ ...payload });
    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual(payload);
  });

  it('drops prototype-pollution keys without polluting Object.prototype', () => {
    const { req, next } = run(
      JSON.parse('{"a":1,"__proto__":{"polluted":true},"constructor":{"x":1},"prototype":{"y":2}}')
    );
    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ a: 1 });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('recurses into nested objects and arrays', () => {
    const { err } = run({ a: { b: [{ c: '<x>' }] } });
    expect((err as AppError)?.status).toBe(400);
  });

  it('rejects markup in the query string', () => {
    const { err } = run({}, { search: '<script>' });
    expect((err as AppError)?.status).toBe(400);
  });

  it('rejects an over-deep body instead of blowing the stack', () => {
    let deep: Record<string, unknown> = {};
    const root = deep;
    for (let i = 0; i < 50; i++) {
      const child: Record<string, unknown> = {};
      deep.child = child;
      deep = child;
    }
    const { err } = run(root);
    expect((err as AppError)?.status).toBe(400);
  });

  it('leaves non-string scalars untouched', () => {
    const { req } = run({ n: 5, b: true, z: null, arr: [1, 2, 3] });
    expect(req.body).toEqual({ n: 5, b: true, z: null, arr: [1, 2, 3] });
  });

  it('passes password / passphrase fields through untouched (opaque credentials)', () => {
    const NUL = String.fromCharCode(0);
    const body = {
      password: 'a<script>b',
      currentPassword: `keep${NUL}me<tag`,
      newPassword: '</close>',
      confirmPassword: 'plain',
      passphrase: 'a<b',
      note: 'a plain note',
    };
    const { req, next } = run({ ...body });
    expect(next).toHaveBeenCalledWith(); // NOT rejected despite the markup
    expect(req.body).toEqual(body); // byte-for-byte, control char kept
  });

  it('still rejects markup in a non-credential field alongside a password', () => {
    const { err } = run({ password: 'a<b>c', name: '<script>' });
    expect((err as AppError)?.status).toBe(400);
  });
});
