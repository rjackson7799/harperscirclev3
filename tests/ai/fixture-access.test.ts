import { afterEach, describe, expect, it } from 'vitest';
import { startAnthropicFixtureServer } from '../../scripts/ai-fixture-server.mjs';

const KEY = 'synthetic-fixture-access-key-for-tests-only';
const servers: Awaited<ReturnType<typeof startAnthropicFixtureServer>>[] = [];
async function start(options = {}) {
  const server = await startAnthropicFixtureServer(options);
  servers.push(server);
  return server;
}
afterEach(async () => { await Promise.all(servers.splice(0).map(s => s.close())); });

describe('staging fixture access boundary', () => {
  it('refuses non-loopback binding without a dedicated key', async () => {
    await expect(start({ host: '0.0.0.0' })).rejects.toThrow('access key');
  });
  it('refuses a short or blank configured key', async () => {
    await expect(start({ accessKey: 'short' })).rejects.toThrow('access key');
    await expect(start({ accessKey: '' })).rejects.toThrow('access key');
  });
  it('keeps the local fixture usable without a key', async () => {
    const server = await start();
    expect((await fetch(server.url)).status).toBe(200);
    expect((await fetch(`${server.url}/v1/messages`, { method: 'POST', body: '{}' })).status).toBe(200);
  });
  it('refuses missing and incorrect credentials before parsing or recording the body', async () => {
    const server = await start({ accessKey: KEY });
    const rejectedHeaders: Record<string, string>[] = [{}, { 'x-api-key': `${KEY}wrong` }];
    for (const headers of rejectedHeaders) {
      const response = await fetch(`${server.url}/v1/messages`, {
        method: 'POST', headers, body: 'invalid JSON that must never reach the recorder',
      });
      expect(response.status).toBe(401);
    }
    expect(server.requests).toHaveLength(0);
  });
  it('accepts the SDK key header but removes credentials from captured evidence', async () => {
    const server = await start({ accessKey: KEY });
    const response = await fetch(`${server.url}/v1/messages`, {
      method: 'POST', headers: { 'x-api-key': KEY, authorization: 'Bearer synthetic-secret', 'anthropic-beta': 'fixture-test' }, body: '{}',
    });
    expect(response.status).toBe(200);
    expect(server.requests).toHaveLength(1);
    expect(JSON.stringify(server.requests)).not.toContain(KEY);
    expect(JSON.stringify(server.requests)).not.toContain('synthetic-secret');
    expect(server.requests[0].headers['anthropic-beta']).toBe('fixture-test');
  });
  it('offers only a minimal unauthenticated health response', async () => {
    const server = await start({ accessKey: KEY });
    expect(await (await fetch(server.url)).json()).toEqual({ ok: true, fixture: 'anthropic-messages' });
    expect((await fetch(`${server.url}/v1/messages`)).status).toBe(401);
  });
});
