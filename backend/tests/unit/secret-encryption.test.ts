import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '../../src/lib/secret-encryption';

describe('secret-encryption (AES-256-GCM at-rest encryption)', () => {
  it('round-trips a plaintext value', () => {
    const packed = encryptSecret('a very secret app password', 'test-label-v1');
    expect(packed).not.toContain('a very secret app password');
    expect(decryptSecret(packed, 'test-label-v1')).toBe('a very secret app password');
  });

  it('is non-deterministic — two encryptions of the same value differ (random IV)', () => {
    const a = encryptSecret('same value', 'test-label-v1');
    const b = encryptSecret('same value', 'test-label-v1');
    expect(a).not.toBe(b);
    expect(decryptSecret(a, 'test-label-v1')).toBe('same value');
    expect(decryptSecret(b, 'test-label-v1')).toBe('same value');
  });

  it('a different label cannot decrypt another label\'s ciphertext (domain separation)', () => {
    const packed = encryptSecret('secret', 'label-a');
    expect(() => decryptSecret(packed, 'label-b')).toThrow();
  });

  it('rejects a tampered ciphertext (GCM auth-tag check)', () => {
    const packed = encryptSecret('secret', 'test-label-v1');
    const [iv, tag, data] = packed.split('.');
    const tampered = [iv, tag, `${data.slice(0, -2)}zz`].join('.');
    expect(() => decryptSecret(tampered, 'test-label-v1')).toThrow();
  });

  it('rejects a malformed packed value', () => {
    expect(() => decryptSecret('not-the-right-shape', 'test-label-v1')).toThrow();
  });
});
