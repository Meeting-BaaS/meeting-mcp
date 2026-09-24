import { describe, expect, it } from 'vitest';
import { resolvePort } from '../src/config';

describe('resolvePort', () => {
  it('defaults when PORT is unset or blank', () => {
    expect(resolvePort(undefined)).toBe(7017);
    expect(resolvePort('')).toBe(7017);
    expect(resolvePort('   ')).toBe(7017);
  });

  it('accepts valid integers, including 0 for an ephemeral port', () => {
    expect(resolvePort('8080')).toBe(8080);
    expect(resolvePort('0')).toBe(0);
    expect(resolvePort('65535')).toBe(65535);
  });

  it('fails fast on invalid values instead of silently rebinding', () => {
    expect(() => resolvePort('abc')).toThrow(/Invalid PORT/);
    expect(() => resolvePort('-1')).toThrow(/Invalid PORT/);
    expect(() => resolvePort('65536')).toThrow(/Invalid PORT/);
    expect(() => resolvePort('80.5')).toThrow(/Invalid PORT/);
    expect(() => resolvePort('NaN')).toThrow(/Invalid PORT/);
  });
});
