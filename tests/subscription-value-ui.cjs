const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const { createServer } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const server = await createServer({ configFile: false, root: path.resolve(__dirname, '..'), plugins: [react()], logLevel: 'error', server: { host: '127.0.0.1', port: 1422, strictPort: false, watch: { ignored: ['**/.codex/**', '**/src-tauri/**', '**/cpa-core/**'] } } });
  let browser;
  try {
    await server.listen();
    const base = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem('easy-cli-proxy-api.locale', 'en');
      localStorage.setItem('easy-cli-proxy-api.theme', 'dark');
      localStorage.setItem('easy-cli-proxy-api.subscription-value.month', '2026-09');
    });
    await page.goto(base + '/?mock=running');
    await page.getByRole('button', { name: 'Subscription Value', exact: true }).click();
    const root = page.locator('.subscription-value-page');
    await root.locator('.sv-account').first().waitFor();
    assert.equal(await root.getByTestId('sv-total').innerText(), '$1,486.40');
    assert.match(await root.locator('.sv-stats').innerText(), /Fees entered for 0/);
    const antigravity = root.locator('.sv-account').filter({ hasText: 'Antigravity' }).first();
    await antigravity.click();
    assert.match(await root.locator('.sv-models').innerText(), /claude-sonnet-demo/);
    assert.match(await root.locator('.sv-trend').innerText(), /50 requests missing rates/);
    await root.getByRole('button', { name: 'Show all subscriptions', exact: true }).click();
    await root.getByRole('button', { name: 'Subscription fees', exact: true }).click();
    const fields = root.locator('.sv-fee-fields input');
    await fields.first().fill('-1');
    await root.getByRole('button', { name: 'Save fees', exact: true }).click();
    assert.match(await root.getByRole('alert').innerText(), /at most two decimal/);
    await fields.first().fill('20');
    await root.getByRole('button', { name: 'Save fees', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#sv-fees'));
    await page.waitForFunction(() => document.querySelector('.sv-stats')?.textContent.includes('Fees entered for 1'));
    await page.getByRole('button', { name: 'Usage', exact: true }).click();
    await page.getByRole('button', { name: 'Subscription Value', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.sv-stats')?.textContent.includes('Fees entered for 1'));
    await root.getByLabel('Month', { exact: true }).fill('2026-08');
    await page.waitForFunction(() => document.querySelector('.sv-stats')?.textContent.includes('Fees entered for 0'));
    await root.getByLabel('Month', { exact: true }).fill('2026-09');
    await page.waitForFunction(() => document.querySelector('.sv-stats')?.textContent.includes('Fees entered for 1'));
    const dir = path.resolve('.codex/subscription-value'); fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, 'dark.png'), fullPage: true });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.screenshot({ path: path.join(dir, 'light.png'), fullPage: true });
    for (const width of [1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1050 });
      await page.waitForTimeout(150);
      const metrics = await root.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
      assert.ok(metrics.scroll <= metrics.width + 1, JSON.stringify({ width, ...metrics }));
    }
    await page.screenshot({ path: path.join(dir, 'narrow.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1050 });
    await page.goto(base + '/?mock=empty');
    await page.getByRole('button', { name: 'Subscription Value', exact: true }).click();
    await root.locator('.sv-empty').waitFor();
    await page.goto(base + '/?mock=error');
    await page.getByRole('button', { name: 'Subscription Value', exact: true }).click();
    await root.getByRole('alert').waitFor();
    assert.equal(await root.locator('.sv-account').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Subscription Value: account/model drilldown, missing pricing, fee validation, persistence, month boundaries, responsive layout, offline navigation, empty/error states passed.');
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
