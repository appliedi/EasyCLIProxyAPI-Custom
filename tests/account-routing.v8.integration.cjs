// Run with CPA_V8_TEST_CORE pointing to the bundled-compatible v8 executable.
// Uses only loopback fake Claude upstreams and an isolated temporary configuration.
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { mkdtemp, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = (server) => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });

(async () => {
  if (!process.env.CPA_V8_TEST_CORE) {
    console.log('SKIP: set CPA_V8_TEST_CORE to run actual core routing checks.');
    return;
  }
  let failPrimary = false;
  const upstream = http.createServer(async (request, response) => {
    for await (const _ of request) { /* Drain request body. */ }
    const account = request.headers['x-api-key'] === 'test-account-primary'
      || request.headers.authorization === 'Bearer test-account-primary' ? 'primary' : 'backup';
    response.setHeader('Content-Type', 'application/json');
    if (failPrimary && account === 'primary') {
      response.writeHead(429);
      response.end(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'Simulated quota exhaustion' } }));
      return;
    }
    response.end(JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-test',
      content: [{ type: 'text', text: account }], stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 } }));
  });
  let child;
  try {
    const upstreamPort = await listen(upstream);
    const reserved = http.createServer();
    const port = await listen(reserved);
    await close(reserved);
    const work = await mkdtemp(path.join(tmpdir(), 'easycpa-routing-'));
    const providers = (primary, backup) => [{ name: 'isolated-claude', 'base-url': `http://127.0.0.1:${upstreamPort}`,
      models: [{ name: 'claude-test' }], keys: [
        { 'api-key': 'test-account-primary', priority: primary },
        { 'api-key': 'test-account-backup', priority: backup },
      ] }];
    const config = {
      'config-version': 8,
      server: { host: '127.0.0.1', port },
      management: { 'secret-key': 'isolated-routing-secret', 'disable-control-panel': true, 'disable-auto-update-panel': true },
      access: { 'api-keys': ['isolated-routing-client'] },
      oauth: { 'auth-dir': path.join(work, 'auth') },
      routing: { strategy: 'round-robin', 'session-affinity': true, 'session-affinity-ttl': '3s', retry: { 'request-retry': 0, 'max-retry-interval': 0 } },
      'api-keys': { claude: providers(10, 0) },
    };
    const configPath = path.join(work, 'config.yaml');
    await writeFile(configPath, JSON.stringify(config));
    child = spawn(path.resolve(process.env.CPA_V8_TEST_CORE), ['-config', configPath, '-local-model'], { cwd: work, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '';
    child.stdout.on('data', (chunk) => { log = (log + chunk).slice(-12000); });
    child.stderr.on('data', (chunk) => { log = (log + chunk).slice(-12000); });
    let startupError;
    child.on('error', (error) => { startupError = error; });
    const origin = `http://127.0.0.1:${port}`;
    const management = async (method, endpoint, body) => {
      const response = await fetch(`${origin}/v8/management${endpoint}`, { method,
        headers: { Authorization: 'Bearer isolated-routing-secret', 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
      const text = await response.text();
      assert.ok(response.ok, `Management ${endpoint}: ${response.status} ${text}`);
      return text ? JSON.parse(text) : null;
    };
    let ready = false;
    for (let index = 0; index < 80; index++) {
      if (startupError) throw startupError;
      if (child.exitCode !== null) throw new Error(`Core exited: ${log}`);
      try { await management('GET', '/config'); ready = true; break; } catch { await delay(100); }
    }
    assert.ok(ready, `Core not ready: ${log}`);
    const request = async (session) => {
      const response = await fetch(`${origin}/v1/messages`, { method: 'POST',
        headers: { Authorization: 'Bearer isolated-routing-client', 'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01', 'X-Claude-Code-Session-Id': session },
        body: JSON.stringify({ model: 'claude-test', max_tokens: 10, messages: [{ role: 'user', content: 'test' }] }),
        signal: AbortSignal.timeout(5000) });
      const text = await response.text();
      assert.ok(response.ok, `Inference failed: ${response.status} ${text}`);
      return JSON.parse(text).content[0].text;
    };
    const waitForNewSessionAccount = async (expected) => {
      for (let index = 0; index < 30; index++) {
        if (await request(randomUUID()) === expected) return;
        await delay(100);
      }
      assert.fail(`New session did not select ${expected}`);
    };
    const session = randomUUID();
    assert.equal(await request(session), 'primary', 'New sessions prefer the higher priority');
    await management('PUT', '/config/api-keys/claude', providers(10, 20));
    await waitForNewSessionAccount('backup');
    assert.equal(await request(session), 'primary', 'Changing priority must not move a bound session');
    // Total activity exceeds the three-second TTL while each gap stays below it.
    for (let index = 0; index < 3; index++) {
      await delay(1200);
      assert.equal(await request(session), 'primary', 'Activity must renew affinity');
    }
    failPrimary = true;
    assert.equal(await request(session), 'backup', 'Unavailable bound account must fail over');
    failPrimary = false;
    await management('PUT', '/config/api-keys/claude', providers(30, 20));
    await waitForNewSessionAccount('primary');
    assert.equal(await request(session), 'backup', 'Recovery must not pull an active session away from backup');
    await delay(3200);
    assert.equal(await request(session), 'primary', 'After idle expiry the session must use current priority');
    console.log('PASS: actual v8 core prioritizes new sessions, preserves active and failover bindings, renews TTL on activity, and reselects after idle expiry.');
  } finally {
    if (child && child.exitCode === null && !child.killed) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    await close(upstream);
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
