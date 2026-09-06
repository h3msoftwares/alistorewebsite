import { describe, it, expect, beforeEach } from 'vitest';
import { rememberResetReturn, clearResetReturn, takeResetReturn } from './reset-return';

beforeEach(() => window.localStorage.clear());

describe('reset-return hint', () => {
  it('remembers and consumes a safe path once', () => {
    rememberResetReturn('/en/account');
    expect(takeResetReturn()).toBe('/en/account');
    expect(takeResetReturn()).toBeNull(); // consumed
  });

  it('clearResetReturn wipes it', () => {
    rememberResetReturn('/ar/account');
    clearResetReturn();
    expect(takeResetReturn()).toBeNull();
  });

  it('rejects unsafe / non-path values', () => {
    const bs = String.fromCharCode(92); // backslash
    for (const bad of ['//evil.com', 'https://evil.com', `/${bs}evil.com`, 'evil', '', '/']) {
      window.localStorage.setItem('alistore:reset-return', bad);
      expect(takeResetReturn(), JSON.stringify(bad)).toBeNull();
    }
    rememberResetReturn('//evil.com');
    expect(window.localStorage.getItem('alistore:reset-return')).toBeNull();
  });

  it('returns null when nothing is stored', () => {
    expect(takeResetReturn()).toBeNull();
  });
});
