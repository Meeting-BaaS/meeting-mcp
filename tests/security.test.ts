import { describe, expect, it } from 'vitest';
import {
  getHeader,
  isLoopbackAddress,
  isOriginAllowed,
  parseAllowedOrigins,
  redactSecrets,
  redactString,
} from '../src/utils/security';

describe('redaction', () => {
  it('masks values whose keys look sensitive', () => {
    const redacted = redactSecrets({
      calendarId: 'cal-1',
      apiKey: 'super-secret',
      nested: { refreshToken: 'rt-123', clientSecret: 'cs-123' },
    });

    expect(redacted).toEqual({
      calendarId: 'cal-1',
      apiKey: '[REDACTED]',
      nested: { refreshToken: '[REDACTED]', clientSecret: '[REDACTED]' },
    });
  });

  it('scrubs known secret shapes from free-form strings', () => {
    expect(redactString('use API key qrc_o-Fx3GXW3TC7_cLvatIW here')).toBe(
      'use API key [REDACTED] here',
    );
    expect(redactString('Authorization: Bearer abcdefghijklmnop')).toContain('[REDACTED]');
  });

  it('leaves non-sensitive payloads intact', () => {
    expect(redactSecrets({ status: 'upcoming', limit: 10 })).toEqual({
      status: 'upcoming',
      limit: 10,
    });
  });
});

describe('getHeader', () => {
  it('is case-insensitive and unwraps arrays', () => {
    expect(getHeader({ 'X-Api-Key': 'secret' }, 'x-api-key')).toBe('secret');
    expect(getHeader({ 'x-api-key': ['a', 'b'] }, 'x-api-key')).toBe('a');
    expect(getHeader(undefined, 'x-api-key')).toBeUndefined();
    expect(getHeader({}, 'x-api-key')).toBeUndefined();
  });
});

describe('isLoopbackAddress', () => {
  it('accepts IPv4 and IPv6 loopback, including IPv4-mapped', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('127.5.5.5')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isLoopbackAddress('192.168.1.30')).toBe(false);
    expect(isLoopbackAddress('::ffff:192.168.1.30')).toBe(false);
    expect(isLoopbackAddress('2a01:e0a:dd6:e8b0::1')).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
    expect(isLoopbackAddress(null)).toBe(false);
  });
});

describe('origin allowlist', () => {
  it('parses comma-separated values', () => {
    expect(parseAllowedOrigins('http://a.test, http://b.test')).toEqual([
      'http://a.test',
      'http://b.test',
    ]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
    expect(parseAllowedOrigins('')).toEqual([]);
  });

  it('allows everything when no allowlist is configured', () => {
    expect(isOriginAllowed('http://evil.test', [])).toBe(true);
  });

  it('enforces the allowlist when configured', () => {
    const allowlist = ['http://allowed.test'];
    expect(isOriginAllowed('http://allowed.test', allowlist)).toBe(true);
    expect(isOriginAllowed('http://evil.test', allowlist)).toBe(false);
    // Non-browser clients do not send an Origin header.
    expect(isOriginAllowed(undefined, allowlist)).toBe(true);
  });

  it('supports a wildcard entry', () => {
    expect(isOriginAllowed('http://anything.test', ['*'])).toBe(true);
  });
});
