import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readAppVersion } from './version.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function prepareInstaller({ portable, arch, output }) {
  if (!['amd64', 'aarch64'].includes(arch)) throw new Error('Installer architecture must be amd64 or aarch64');
  const directory = resolve(portable);
  const version = await readAppVersion();
  const manifest = JSON.parse(await readFile(join(directory, 'portable-app.json'), 'utf8'));
  if (manifest.version !== version || manifest.platform !== 'windows' || manifest.arch !== arch || manifest.application !== 'EasyCLIProxyAPI') {
    throw new Error('Portable payload does not match the installer version/platform/architecture');
  }
  const coreVersion = (await readFile(join(directory, 'core-version.txt'), 'utf8')).trim().replace(/^v/, '');
  if (!/^\d+(?:\.\d+)+$/.test(coreVersion)) throw new Error('Invalid bundled core version');
  const archive = `CLIProxyAPI_${coreVersion}_windows_${arch}.zip`;
  const checksums = await readFile(join(root, 'cpa-core/checksums.txt'), 'utf8');
  const expected = checksums.split(/\r?\n/).map(line => line.trim().split(/\s+/)).find(parts => parts[1]?.replace(/^\*/, '') === archive)?.[0]?.toLowerCase();
  const actual = createHash('sha256').update(await readFile(join(directory, 'cpa-core', archive))).digest('hex');
  if (!expected || expected !== actual) throw new Error('Installer core archive checksum mismatch');

  const config = JSON.parse(await readFile(join(root, 'src-tauri/tauri.installer.conf.json'), 'utf8'));
  // Exact allowlist: never glob a working portable folder that might hold OAuth
  // credentials, config.toml, databases, logs, or an existing storage locator.
  config.bundle.resources = {
    [join(directory, 'portable-app.json')]: 'portable-app.json',
    [join(directory, 'core-version.txt')]: 'core-version.txt',
    [join(directory, 'cpa-core', archive)]: `cpa-core/${archive}`,
    [join(root, 'src-tauri/windows/installation.json')]: 'installation.json',
  };
  config.bundle.licenseFile = join(root, 'LICENSE');
  config.bundle.windows.nsis.installerHooks = join(root, 'src-tauri/windows/installer-hooks.nsh');
  // The native updater requires this exact executable filename.
  await copyFile(join(directory, 'EasyCLIProxyAPI.exe'), join(root, 'src-tauri/target/release/EasyCLIProxyAPI.exe'));
  const configPath = resolve(output);
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return configPath;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = new Map();
  for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i], process.argv[i + 1]);
  if (!args.get('--portable') || !args.get('--output')) throw new Error('--portable and --output are required');
  console.log(await prepareInstaller({ portable: args.get('--portable'), arch: args.get('--arch'), output: args.get('--output') }));
}
