import { describe, it, expect } from 'vitest';
import { redactSensitive } from './redact';

describe('redactSensitive', () => {
  it('redacts sensitive keys by name (code/api_key/token/password/secret)', () => {
    const out = redactSensitive({ code: 'KEY123', api_key: 'X', token: 'Y', password: 'p', user: 'bob', cost: 5 });
    expect(out).toEqual({
      code: '***REDACTED***', api_key: '***REDACTED***', token: '***REDACTED***', password: '***REDACTED***',
      user: 'bob', cost: 5
    });
  });

  it('redacts token-like keys even when not an exact match (access_token, refresh_token)', () => {
    const out = redactSensitive({ access_token: 'a', refresh_token: 'b', useable_access_token: 'c', id: 1 });
    expect(out).toEqual({ access_token: '***REDACTED***', refresh_token: '***REDACTED***', useable_access_token: '***REDACTED***', id: 1 });
  });

  it('recurses into nested objects and arrays', () => {
    const out = redactSensitive({ outer: { password: 'p', name: 'n' }, list: [{ code: 't', id: 1 }] });
    expect(out).toEqual({ outer: { password: '***REDACTED***', name: 'n' }, list: [{ code: '***REDACTED***', id: 1 }] });
  });

  it('scrubs a known secret value wherever it appears in strings', () => {
    const out = redactSensitive({ note: 'my key is SECRET-abcdef here', nested: { msg: 'SECRET-abcdef' } }, ['SECRET-abcdef']);
    expect(out).toEqual({ note: 'my key is ***REDACTED*** here', nested: { msg: '***REDACTED***' } });
  });

  it('leaves non-sensitive data untouched', () => {
    const out = redactSensitive({ username: 'bob', bits: 100, reward: 'Hydrate' });
    expect(out).toEqual({ username: 'bob', bits: 100, reward: 'Hydrate' });
  });

  it('redacts auth/oauth/code-style keys that carry third-party tokens (incl. camelCase)', () => {
    const out = redactSensitive({
      Authorization: 'Bearer xyz',
      oauth: 'o',
      oauth_token: 'ot',
      auth_code: 'ac',
      authCode: 'ac2',
      access_code: 'acc',
      accessCode: 'acc2',
      channelCode: 'cc'
    });
    expect(out).toEqual({
      Authorization: '***REDACTED***',
      oauth: '***REDACTED***',
      oauth_token: '***REDACTED***',
      auth_code: '***REDACTED***',
      authCode: '***REDACTED***',
      access_code: '***REDACTED***',
      accessCode: '***REDACTED***',
      channelCode: '***REDACTED***'
    });
  });

  it('does NOT redact benign keys that merely contain auth/code as a fragment', () => {
    const out = redactSensitive({ author: 'Jane', qrcode: 'q', barcode: 'b', zipcode: '90210', encoded: 'e' });
    expect(out).toEqual({ author: 'Jane', qrcode: 'q', barcode: 'b', zipcode: '90210', encoded: 'e' });
  });
});
