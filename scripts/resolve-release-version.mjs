import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readAppVersion, validateAppVersion } from './version.mjs';
import { formatPreviewStamp } from './preview-tag.mjs';

export function resolveReleaseVersion({ sourceVersion, env = process.env, date = new Date() }) {
  validateAppVersion(sourceVersion);
  const base = sourceVersion.replace(/[-+].*$/, '');
  let tag = String(env.REQUESTED_VERSION || '').trim();
  const event = env.EVENT_NAME || env.GITHUB_EVENT_NAME || '';
  const type = env.REF_TYPE || env.GITHUB_REF_TYPE || '';
  const ref = env.REF_NAME || env.GITHUB_REF_NAME || '';
  const run = env.GITHUB_RUN_NUMBER || '1';
  const attempt = env.GITHUB_RUN_ATTEMPT || '1';
  const preview = (event === 'push' && type === 'branch' && ref === 'preview') || /^preview-[0-9]{8}-[0-9]{4}$/.test(tag) || (type === 'tag' && /^preview-[0-9]{8}-[0-9]{4}$/.test(ref));
  let version;
  if (env.MIAOMIAO_PREVIEW === 'true') {
    version = validateAppVersion(base + '-miaomiao.' + run + '.' + attempt); tag = 'v' + version;
  } else if (event === 'pull_request') {
    version = validateAppVersion(base + '-pr.' + env.PR_NUMBER + '.' + run + '.' + attempt); tag = 'v' + version;
  } else if (preview) {
    const stamp = formatPreviewStamp(date); tag = 'preview-' + stamp; version = base + '-preview.' + stamp;
  } else if (!tag) {
    version = sourceVersion; tag = 'v' + version;
  } else if (tag === 'only-preview') {
    version = base + '-preview.' + formatPreviewStamp(date);
  } else {
    version = validateAppVersion(tag.replace(/^v/, ''), 'release tag'); tag = 'v' + version;
  }
  return { version, tag };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = resolveReleaseVersion({ sourceVersion: await readAppVersion() });
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  await appendFile(process.env.GITHUB_OUTPUT, 'version=' + result.version + '\ntag=' + result.tag + '\n');
}
