import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const run = (args: string[]) => spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', 'tests/windows-installer-smoke.ps1', ...args], { encoding: 'utf8' });
const base = ['-Installer', 'missing-installer.exe', '-ProductName', 'EasyCLIProxyAPI Custom Release Smoke', '-AutostartName', 'SmokeOnly', '-RunRegistryPath', 'HKCU:\\Software\\EasyCLIProxyAPI-Smoke-Contract\\Run'];
test.skipIf(process.platform !== 'win32')('custom installer smoke overrides require a matching bundle manifest before side effects', () => {
  const result = run(base);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Custom smoke bundle requires an isolation manifest');
}, 15000);
test.skipIf(process.platform !== 'win32')('a smoke manifest cannot authorize a different installer or registry target', () => {
  const dir = mkdtempSync(join(tmpdir(),'installer-smoke-contract-'));
  try {
    const manifest = join(dir,'manifest.json');
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, productName: 'another product', binaryName: 'EasyCLIProxyAPI.exe', autostartName: 'SmokeOnly', runRegistryPath: 'HKCU:\\Software\\EasyCLIProxyAPI-Smoke-Contract\\Run', installerSha256: '0'.repeat(64) }));
    const result = run([...base, '-IsolationManifest', manifest]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Smoke parameters do not match the isolation manifest');
    const installer = join(dir, 'fixture.exe');
    writeFileSync(installer, 'not an executable');
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, productName: 'EasyCLIProxyAPI Custom Release Smoke', binaryName: 'EasyCLIProxyAPI.exe', autostartName: 'SmokeOnly', runRegistryPath: base[7], installerSha256: '0'.repeat(64) }));
    const wrongHash = run(['-Installer', installer, ...base.slice(2), '-IsolationManifest', manifest]);
    expect(wrongHash.status).not.toBe(0);
    expect(wrongHash.stderr).toContain('Installer does not match the isolation manifest SHA-256');
  } finally { rmSync(dir,{recursive:true,force:true}); }
}, 15000);
