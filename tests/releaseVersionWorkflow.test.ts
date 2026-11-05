import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveReleaseVersion } from '../scripts/resolve-release-version.mjs';
const resolve = (env: Record<string,string>) => resolveReleaseVersion({ sourceVersion: '0.3.6', env: { GITHUB_RUN_NUMBER: '10', GITHUB_RUN_ATTEMPT: '1', PR_NUMBER: '42', ...env }, date: new Date('2026-11-05T18:23:00Z') });
describe('release version resolution workflow', () => {
  it('supports legacy preview tags with a reproducible preview version', () => expect(resolve({ REQUESTED_VERSION: 'only-preview' })).toEqual({ tag: 'only-preview', version: '0.3.6-preview.20261105-1823' }));
  it('normalizes bare semver', () => expect(resolve({ REQUESTED_VERSION: '1.2.3' })).toEqual({ tag: 'v1.2.3', version: '1.2.3' }));
  it('preserves prerelease semver', () => expect(resolve({ REQUESTED_VERSION: 'v2.0.0-rc.1' })).toEqual({ tag: 'v2.0.0-rc.1', version: '2.0.0-rc.1' }));
  it('defaults to the source version', () => expect(resolve({})).toEqual({ tag: 'v0.3.6', version: '0.3.6' }));
  it('resolves rolling miaomiao builds', () => expect(resolve({ MIAOMIAO_PREVIEW: 'true' })).toEqual({ tag: 'v0.3.6-miaomiao.10.1', version: '0.3.6-miaomiao.10.1' }));
  it('resolves PR builds', () => expect(resolve({ EVENT_NAME: 'pull_request' })).toEqual({ tag: 'v0.3.6-pr.42.10.1', version: '0.3.6-pr.42.10.1' }));
  it('resolves timestamped preview tags and branch builds', () => {
    for (const env of [{ REQUESTED_VERSION: 'preview-20261104-1623' }, { EVENT_NAME: 'push', REF_TYPE: 'branch', REF_NAME: 'preview' }]) expect(resolve(env)).toEqual({ tag: 'preview-20261105-1823', version: '0.3.6-preview.20261105-1823' });
  });
  it('rejects unsafe or unknown release tags', () => {
    for (const tag of ['../main', 'latest', 'vbroken', 'preview-bad']) expect(() => resolve({ REQUESTED_VERSION: tag })).toThrow();
  });
  it('the workflow runs the portable resolver and the CLI writes its outputs', () => {
    const workflow = Bun.YAML.parse(readFileSync('.github/workflows/release.yml','utf8')) as any;
    expect(workflow.jobs.version.steps.find((s:any) => s.id === 'resolve').run.trim()).toBe('node scripts/resolve-release-version.mjs');
    const directory = mkdtempSync(join(tmpdir(),'release-version-'));
    try {
      const output = join(directory,'outputs');
      const result = spawnSync(process.execPath, ['scripts/resolve-release-version.mjs'], { env: { ...process.env, GITHUB_OUTPUT: output, REQUESTED_VERSION: 'v1.2.3', EVENT_NAME: 'workflow_dispatch', MIAOMIAO_PREVIEW: 'false' }, encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(readFileSync(output,'utf8')).toBe('version=1.2.3\ntag=v1.2.3\n');
    } finally { rmSync(directory,{recursive:true,force:true}); }
  });
});
