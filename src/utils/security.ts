/**
 * Security helpers used to harden the HTTP/SSE transport.
 *
 * These utilities are intentionally dependency-free so they can be unit tested
 * in isolation from FastMCP and the network stack.
 */

/** Header/field names whose values must never be written to logs. */
const SENSITIVE_KEY_PATTERN =
  /(api[-_]?key|apikey|authorization|auth[-_]?token|access[-_]?token|refresh[-_]?token|secret|password|credential)/i;

/** Value shapes that are always treated as secrets, regardless of key name. */
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\bqrc_[A-Za-z0-9_-]{6,}\b/g,
  /\b(?:sk|pk|rk)_[A-Za-z0-9_-]{8,}\b/g,
  /\bBearer\s+[A-Za-z0-9._-]{8,}\b/gi,
];

/**
 * Redacts known secret shapes embedded in an arbitrary string.
 */
export function redactString(input: string): string {
  let output = input;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    output = output.replace(pattern, '[REDACTED]');
  }
  return output;
}

/**
 * Recursively redacts secrets from a value before it is logged.
 *
 * Objects whose keys look sensitive (e.g. `apiKey`, `refreshToken`) have their
 * values replaced, and any known secret pattern is scrubbed from strings.
 */
export function redactSecrets<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[REDACTED]' : redactValue(nested);
    }
    return result;
  }

  return value;
}

/**
 * Case-insensitive header lookup that tolerates Node's string-or-array values.
 */
export function getHeader(
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) {
    return undefined;
  }

  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== wanted) {
      continue;
    }
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  return undefined;
}

/**
 * True when the address is an IPv4 or IPv6 loopback address.
 *
 * IPv4-mapped IPv6 addresses (returned by Node when a listener bound to `::`
 * receives an IPv4 connection) are unwrapped before the check.
 */
export function isLoopbackAddress(address: string | undefined | null): boolean {
  if (!address) {
    return false;
  }

  let normalized = address;
  if (normalized.startsWith('::ffff:')) {
    normalized = normalized.slice('::ffff:'.length);
  }

  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') {
    return true;
  }

  return /^127\./.test(normalized);
}

/**
 * Parses a comma-separated `MCP_ALLOWED_ORIGINS` value.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Checks an incoming `Origin` header against the configured allowlist.
 *
 * When no allowlist is configured, browser origins are not restricted and
 * authentication relies on the per-request API key. Non-browser clients do not
 * send an `Origin` header and are always allowed through this check.
 */
export function isOriginAllowed(origin: string | undefined, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    return true;
  }
  if (!origin) {
    return true;
  }
  return allowlist.includes('*') || allowlist.includes(origin);
}
