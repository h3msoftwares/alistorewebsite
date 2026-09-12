import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';
import { signConnectState, verifyConnectState } from '../../src/modules/backup/drive-state';

describe('signConnectState / verifyConnectState', () => {
  it('round-trips the admin id', () => {
    const state = signConnectState('admin-123');
    expect(verifyConnectState(state)).toBe('admin-123');
  });

  it('rejects garbage input', () => {
    expect(verifyConnectState('not-a-jwt')).toBeNull();
  });

  it('rejects a token signed with the wrong secret (forged)', () => {
    const forged = jwt.sign({ sub: 'admin-123', purpose: 'backup-drive-connect' }, 'wrong-secret-wrong-secret-wrong');
    expect(verifyConnectState(forged)).toBeNull();
  });

  it('rejects a real token minted for a different purpose', () => {
    const wrongPurpose = jwt.sign({ sub: 'admin-123', purpose: 'something-else' }, env.JWT_ACCESS_SECRET, {
      expiresIn: '10m',
    });
    expect(verifyConnectState(wrongPurpose)).toBeNull();
  });

  it('rejects an expired state', () => {
    const expired = jwt.sign({ sub: 'admin-123', purpose: 'backup-drive-connect' }, env.JWT_ACCESS_SECRET, {
      expiresIn: '-1s',
    });
    expect(verifyConnectState(expired)).toBeNull();
  });
});
