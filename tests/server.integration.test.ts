import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const VALID_KEY = 'valid-test-key';

let child: ChildProcess;
let baseUrl: string;
let output = '';

/** Asks the OS for an unused port so parallel runs and stray processes cannot collide. */
function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Waits until our server is answering. Readiness is defined as a 401 from the
 * auth gate, so a response from an unrelated process on the same port cannot
 * satisfy the check.
 */
async function waitForServer(timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/mcp`, {
        signal: AbortSignal.timeout(1000),
      });
      await response.body?.cancel();
      if (response.status === 401) {
        return;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Server did not become ready in time. Output:\n${output}`);
}

/** Opens an SSE session and returns the response status without holding the stream open. */
async function getMcp(headers: Record<string, string> = {}): Promise<Response> {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/mcp`, { headers, signal: controller.signal });
  if (response.body) {
    await response.body.cancel();
  }
  controller.abort();
  return response;
}

beforeAll(async () => {
  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;

  // MEETING_BAAS_API_KEY is deliberately set: the regression under test is that
  // configuring the operator key must NOT authenticate callers by itself.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(port),
    MEETING_BAAS_API_KEY: 'operator-key-must-not-authenticate-callers',
    MCP_ALLOWED_ORIGINS: 'http://allowed.test',
  };
  delete env.MCP_FROM_CLAUDE;
  delete env.MCP_ALLOW_REMOTE;

  child = spawn(process.execPath, ['dist/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout?.on('data', (chunk) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk) => (output += chunk.toString()));

  await waitForServer();
}, 30000);

afterAll(() => {
  child?.kill('SIGKILL');
});

describe('SSE transport authentication', () => {
  it('rejects a request with no x-api-key even when the operator env key is set', async () => {
    const response = await getMcp();
    expect(response.status).toBe(401);
  });

  it('authenticates a request that carries a valid x-api-key', async () => {
    const response = await getMcp({ 'x-api-key': VALID_KEY });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
  });

  it('rejects a disallowed browser Origin even with a valid key', async () => {
    const response = await getMcp({ 'x-api-key': VALID_KEY, Origin: 'http://evil.test' });
    expect(response.status).toBe(403);
  });

  it('accepts an allowlisted Origin with a valid key', async () => {
    const response = await getMcp({ 'x-api-key': VALID_KEY, Origin: 'http://allowed.test' });
    expect(response.status).toBe(200);
  });
});
