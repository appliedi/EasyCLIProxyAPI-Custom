const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const { createServer } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const server = await createServer({ configFile: false, root: path.resolve(__dirname, '..'), plugins: [react()], logLevel: 'error', server: { host: '127.0.0.1', port: 1421, strictPort: false, watch: { ignored: ['**/.codex/**', '**/src-tauri/**', '**/cpa-core/**'] } } });
  let browser;
  try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}/?mock=running`;
    const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined);
    browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('easy-cli-proxy-api.locale', 'en');
      localStorage.setItem('easy-cli-proxy-api.theme', 'dark');
    });
    page.setDefaultTimeout(15000);
    console.log('Opening quota dashboard');
    await page.goto(base);
    await page.getByRole('button', { name: 'Quota Lookup', exact: true }).click();
    await page.locator('.quota-provider-summary').first().waitFor();
    console.log('Dashboard loaded');
    assert.equal(await page.locator('.quota-provider-summary').count(), 6);
    assert.equal(await page.locator('.quota-ledger-row').count(), 12);
    assert.match(await page.locator('.quota-summary-total').first().innerText(), /Unavailable/);

    await page.getByRole('button', { name: 'Refresh Quota', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.quota-provider-summary small')].some((el) => el.textContent.includes('1 of 1')));
    await page.getByRole('button', { name: 'Refresh Quota', exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.quota-row-list').length >= 10);
    const claude = page.getByRole('article', { name: 'Claude', exact: true });
    assert.match(await claude.innerText(), /59%/);
    await claude.getByRole('combobox').selectOption({ label: '5-hour window' });
    assert.match(await claude.innerText(), /76%/);
    await claude.getByRole('combobox').selectOption({ label: '7-day window' });

    const filters = page.getByRole('group', { name: 'Filter by provider' });
    await filters.getByRole('button', { name: /Codex/ }).click();
    assert.equal(await page.locator('.quota-provider-group').count(), 1);
    assert.match(await page.locator('.quota-provider-group h2').innerText(), /Codex/);
    await filters.getByRole('button', { name: /Kimi/ }).click();
    assert.equal(await page.locator('.quota-provider-group').count(), 1);
    await filters.getByRole('button', { name: /All/ }).click();
    const search = page.getByRole('searchbox', { name: 'Search accounts by name, email or plan' });
    await search.fill('CLAUDE.MOCK@');
    assert.equal(await page.locator('.real-quota-card').count(), 1);
    assert.equal(await page.locator('.quota-provider-summary').count(), 6);
    assert.equal(await page.locator('.quota-fetched-at').count(), 1);
    const before = await page.evaluate(async () => (await import('/src/services/quotaCache.ts')).getQuotaCacheSnapshot());
    await page.getByRole('button', { name: 'Refresh visible (1)', exact: true }).click();
    await page.waitForFunction(async () => {
      const cache = (await import('/src/services/quotaCache.ts')).getQuotaCacheSnapshot();
      return Object.values(cache).every((quota) => quota.status !== 'loading');
    });
    const after = await page.evaluate(async () => (await import('/src/services/quotaCache.ts')).getQuotaCacheSnapshot());
    const codexKey = Object.keys(before).find((key) => key.startsWith('codex-personal.json::'));
    const claudeKey = Object.keys(before).find((key) => key.startsWith('claude-team.json::'));
    assert.equal(after[codexKey].fetchedAt, before[codexKey].fetchedAt, 'Hidden account must not refresh');
    assert.ok(after[claudeKey].fetchedAt > before[claudeKey].fetchedAt, 'Visible account must refresh');
    await search.fill('missing-account');
    assert.equal(await page.locator('.real-quota-card').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Refresh visible (0)', exact: true }).isDisabled(), true);
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    assert.equal(await page.locator('.real-quota-card').count(), 12);
    await page.getByLabel('Sort accounts', { exact: true }).selectOption('remaining');
    await page.getByLabel('Sort accounts', { exact: true }).selectOption('reset');
    await page.getByLabel('Sort accounts', { exact: true }).selectOption('name');
    await page.getByLabel('View', { exact: true }).selectOption('cards');
    assert.equal(await page.locator('.quota-ledger-row').count(), 0);
    await page.reload();
    await page.getByRole('button', { name: 'Quota Lookup', exact: true }).click();
    await page.locator('.quota-provider-summary').first().waitFor();
    assert.equal(await page.getByLabel('View', { exact: true }).inputValue(), 'cards');
    await page.getByLabel('View', { exact: true }).selectOption('ledger');
    await page.getByRole('button', { name: 'Refresh Quota', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.quota-row-list').length >= 10);
    await page.getByRole('button', { name: 'Fetch or refresh quota: claude-team.json', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.quota-row-list').length >= 10);

    await page.getByRole('button', { name: 'Edit account priority: claude-team.json', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Credential settings', exact: true });
    const priority = dialog.getByLabel(/^Priority/);
    await priority.fill('1.5');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    await priority.fill('10');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.querySelector('[aria-label="Edit account priority: claude-team.json"]')?.textContent.includes('10'));
    await page.getByRole('button', { name: 'Edit account priority: claude-team.json', exact: true }).click();
    assert.equal(await priority.inputValue(), '10');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

    const routing = page.locator('.account-routing-panel');
    await routing.locator('summary').click();
    const affinity = routing.getByRole('checkbox', { name: 'Session Affinity', exact: true });
    const ttl = routing.getByLabel('Affinity idle timeout', { exact: true });
    assert.equal(await affinity.isChecked(), true);
    await affinity.uncheck();
    await routing.getByRole('button', { name: 'Save', exact: true }).click();
    await routing.getByRole('status').waitFor();
    assert.match(await routing.locator('summary').innerText(), /Session affinity off/);
    await affinity.check();
    await ttl.fill('2h');
    await routing.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.account-routing-panel summary')?.textContent.includes('Session affinity on'));
    const config = await page.evaluate(async () => (await import('/node_modules/@tauri-apps/api/core.js')).invoke('get_core_config_settings'));
    assert.equal(config.routingSessionAffinity, true);
    assert.equal(config.routingSessionAffinityTtl, '2h');
    assert.equal(config.routingStrategy, 'round-robin', 'Affinity save must preserve strategy');

    const output = path.resolve(__dirname, '../.codex/quota-dashboard');
    fs.mkdirSync(output, { recursive: true });
    for (const theme of ['dark', 'light']) {
      await page.getByRole('button', { name: theme === 'dark' ? 'Dark' : 'Light', exact: true }).click();
      await page.waitForFunction((value) => document.documentElement.dataset.theme === value, theme);
      await page.screenshot({ path: path.join(output, `${theme}.png`), fullPage: true });
    }
    for (const width of [1024, 640, 390]) {
      await page.setViewportSize({ width, height: 850 });
      const overflow = await page.locator('.quota-page').evaluate((element) => element.scrollWidth > element.clientWidth + 1);
      assert.equal(overflow, false, `Quota page overflows at ${width}px`);
    }
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: quota dashboard, priority editing and validation, affinity settings, scoped refresh, layout persistence and responsive layout.');
  } catch (error) {
    console.error(error);
    throw error;
  } finally {
    if (browser) await browser.close();
    server.httpServer?.closeAllConnections();
    await server.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
