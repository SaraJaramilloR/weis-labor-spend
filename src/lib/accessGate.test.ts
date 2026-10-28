import {describe, expect, it} from 'vitest';
import {createHash} from 'node:crypto';
import {ACCESS_SALT, checkPassword, configuredHash, constantTimeEqual, hashPassword, sessionValue} from './accessGate';

const TEST_PASSPHRASE = 'unit-test passphrase only';
const testHash = createHash('sha256').update(ACCESS_SALT + TEST_PASSPHRASE).digest('hex');

describe('demo access gate', () => {
  it('matches the hash produced by the local setup script (same salt and algorithm)', async () => {
    expect(await hashPassword(TEST_PASSPHRASE)).toBe(testHash);
  });
  it('accepts the configured password', async () => {
    expect(await checkPassword(TEST_PASSPHRASE, configuredHash(testHash))).toBe(true);
  });
  it('rejects wrong, empty and oversized passwords', async () => {
    expect(await checkPassword('wrong passphrase', testHash)).toBe(false);
    expect(await checkPassword('', testHash)).toBe(false);
    expect(await checkPassword('x'.repeat(201), testHash)).toBe(false);
  });
  it('fails closed when the deployment has no valid configuration', async () => {
    expect(configuredHash(undefined)).toBeNull();
    expect(configuredHash('')).toBeNull();
    expect(configuredHash('not-a-hash')).toBeNull();
    expect(await checkPassword(TEST_PASSPHRASE, null)).toBe(false);
  });
  it('compares in constant time and rejects different lengths', () => {
    expect(constantTimeEqual('abcd', 'abcd')).toBe(true);
    expect(constantTimeEqual('abcd', 'abce')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
  });
  it('ties the session to the configured hash so a new password ends old sessions', () => {
    expect(sessionValue(testHash)).not.toBe(sessionValue('f'.repeat(64)));
  });
});
