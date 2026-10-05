const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const { createServer } = await import('vite');
  const react = (await import('@vitejs/plugin-react')).default;
  const server = await createServer({ configFile: false, root: path.resolve(__dirname, '..'), plugins: [react()], logLevel: 'error', server: { host: '127.0.0.1', port: 1423, strictPort: false, watch: { ignored: ['**/.codex/**', '**/src-tauri/**', '**/cpa-core/**'] } } });
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
    });
    const navigate = async () => {
      await page.getByRole('button', { name: 'Advanced Features', exact: true }).click();
      await page.getByRole('tab', { name: 'Storage & backups', exact: true }).click();
      await page.locator('.data-storage-current').waitFor();
    };
    await page.goto(base + '/?mock=running');
    await navigate();
    const panel = page.locator('.data-storage-panel');
    assert.match(await panel.locator('.data-storage-current').innerText(), /C:\\Apps\\EasyCLIProxyAPI/);
    assert.equal(await panel.getByLabel('Storage location', { exact: true }).inputValue(), 'user');
    await panel.getByRole('button', { name: 'Copy data & schedule switch', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await panel.locator('.data-storage-pending').count(), 0);
    await panel.getByRole('button', { name: 'Copy data & schedule switch', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Schedule', exact: true }).click();
    await panel.getByRole('button', { name: 'Restart & apply', exact: true }).waitFor();
    assert.equal(await panel.getByLabel('Storage location', { exact: true }).isDisabled(), true);
    // A scheduled migration persists across page navigation, without restarting early.
    await page.getByRole('button', { name: 'Subscription Value', exact: true }).click();
    await navigate();
    await panel.getByRole('button', { name: 'Cancel scheduled operation', exact: true }).click();
    await panel.getByLabel('Database size limit (MB)', { exact: true }).fill('0');
    await panel.getByRole('button', { name: 'Save history limit', exact: true }).click();
    await panel.getByText('History limit saved.', { exact: true }).waitFor();
    await panel.getByLabel('Database size limit (MB)', { exact: true }).fill('64');
    await panel.getByRole('button', { name: 'Save history limit', exact: true }).click();
    assert.match(await page.getByRole('alertdialog').innerText(), /automatically deletes the oldest/);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('tab', { name: 'App preferences', exact: true }).click();
    await page.getByRole('tab', { name: 'Storage & backups', exact: true }).click();
    await panel.locator('.data-storage-current').waitFor();
    assert.equal(await panel.getByLabel('Database size limit (MB)', { exact: true }).inputValue(), '0');
    await panel.getByLabel('Storage location', { exact: true }).selectOption('custom');
    await panel.getByLabel('New data folder', { exact: true }).fill('D:\\Shared data\\New profile');
    await panel.getByRole('button', { name: 'Copy data & schedule switch', exact: true }).click();
    assert.match(await page.getByRole('alertdialog').innerText(), /D:\\Shared data\\New profile/);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Schedule', exact: true }).click();
    await panel.getByRole('button', { name: 'Restart & apply', exact: true }).click();
    // The mock simulates the restart; real disk/SQLite migration is tested in Rust.
    await page.getByRole('tab', { name: 'App preferences', exact: true }).click();
    await page.getByRole('tab', { name: 'Storage & backups', exact: true }).click();
    await panel.locator('.data-storage-current').waitFor();
    assert.match(await panel.locator('.data-storage-current').innerText(), /D:\\Shared data\\New profile/);
    await panel.getByLabel('New backup folder', { exact: true }).fill('E:\\Backups\\today');
    await panel.getByRole('button', { name: 'Schedule backup', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Schedule', exact: true }).click();
    await panel.getByRole('button', { name: 'Cancel scheduled operation', exact: true }).click();
    await panel.getByLabel('Backup folder to restore', { exact: true }).fill('E:\\Backups\\yesterday');
    await panel.getByLabel('New folder for restored data', { exact: true }).fill('D:\\Restored');
    await panel.getByRole('button', { name: 'Verify & schedule restore', exact: true }).click();
    assert.match(await page.getByRole('alertdialog').innerText(), /does not combine histories/);
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel', exact: true }).click();
    const dir = path.resolve('.codex/data-storage'); fs.mkdirSync(dir, { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(dir, 'dark.png'), fullPage: true });
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.screenshot({ path: path.join(dir, 'light.png'), fullPage: true });
    for (const width of [1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1050 });
      const metrics = await panel.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
      assert.ok(metrics.scroll <= metrics.width + 1, JSON.stringify({ width, ...metrics }));
    }
    await page.screenshot({ path: path.join(dir, 'narrow.png'), fullPage: true });
    // Error response must not show invented paths or enable destructive controls.
    await page.goto(base + '/?mock=error');
    await page.getByRole('button', { name: 'Advanced Features', exact: true }).click();
    await page.getByRole('tab', { name: 'Storage & backups', exact: true }).click();
    await panel.getByRole('alert').waitFor();
    assert.equal(await panel.locator('fieldset').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Storage UI: scheduling/cancellation, restart, navigation persistence, retention warning, backup/restore, responsive layouts, and errors passed.');
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
