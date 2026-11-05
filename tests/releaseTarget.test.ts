import { expect, test } from 'bun:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { assertStableTagTarget } from '../scripts/verify-release-target.mjs';

const first = 'a'.repeat(40), second = 'b'.repeat(40);
test('publication uses the build source and verifies its target before release operations', () => {
  const workflow = Bun.YAML.parse(readFileSync('.github/workflows/release.yml', 'utf8')) as any;
  const buildCheckout = workflow.jobs.build.steps.find((step: any) => step.uses?.startsWith('actions/checkout@'));
  const publishCheckout = workflow.jobs.publish.steps.find((step: any) => step.uses?.startsWith('actions/checkout@'));
  expect(publishCheckout.with.ref).toBe(buildCheckout.with.ref);
  const publish = workflow.jobs.publish.steps.find((step: any) => step.name === 'Publish release').run;
  const guard = publish.indexOf('build_commit="$(node scripts/verify-release-target.mjs "$RELEASE_TAG")"');
  expect(guard).toBeGreaterThanOrEqual(0);
  expect(guard).toBeLessThan(publish.indexOf('gh release view'));
  expect(guard).toBeLessThan(publish.indexOf('gh release create'));
  expect(publish).toContain('--target "$build_commit"');
  expect(publish).toContain('Stable release $RELEASE_TAG already exists');
});
test('stable publication rejects a lightweight tag on another commit', () => {
  expect(() => assertStableTagTarget('v1.2.3', first, second + '\trefs/tags/v1.2.3\n')).toThrow('differs from build commit');
  expect(() => assertStableTagTarget('v1.2.3', first, first + '\trefs/tags/v1.2.3\n')).not.toThrow();
});
test('stable publication compares the peeled annotated tag commit', () => {
  const tagObject = 'c'.repeat(40) + '\trefs/tags/v1.2.3\n';
  expect(() => assertStableTagTarget('v1.2.3', first, tagObject + first + '\trefs/tags/v1.2.3^{}\n')).not.toThrow();
  expect(() => assertStableTagTarget('v1.2.3', first, tagObject + second + '\trefs/tags/v1.2.3^{}\n')).toThrow('differs from build commit');
});
test('absent stable tags are allowed but malformed matching refs fail closed', () => {
  expect(() => assertStableTagTarget('v1.2.3', first, '')).not.toThrow();
  expect(() => assertStableTagTarget('v1.2.3', first, 'invalid\trefs/tags/v1.2.3\n')).toThrow();
});
test('release guard CLI checks real remote refs without modifying them', () => {
  const root = mkdtempSync(join(tmpdir(), 'release-target-'));
  const work = join(root, 'work'), remote = join(root, 'remote.git');
  const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  const inWork = (...args: string[]) => git('-C', work, '-c', 'user.name=Release test', '-c', 'user.email=release-test@example.invalid', '-c', 'tag.gpgSign=false', ...args);
  const script = resolve('scripts/verify-release-target.mjs');
  const guard = (tag: string) => spawnSync(process.execPath, [script, tag], { cwd: work, encoding: 'utf8' });
  try {
    git('init', '--quiet', work); git('init', '--quiet', '--bare', remote);
    writeFileSync(join(work, 'fixture'), 'first'); inWork('add', 'fixture'); inWork('commit', '--quiet', '--no-gpg-sign', '-m', 'first');
    inWork('remote', 'add', 'origin', remote); inWork('tag', 'v1.2.3'); inWork('push', '--quiet', 'origin', 'refs/tags/v1.2.3');
    const oldHead = inWork('rev-parse', 'HEAD');
    expect(guard('v1.2.3').stdout.trim()).toBe(oldHead);
    writeFileSync(join(work, 'fixture'), 'second'); inWork('commit', '--quiet', '--no-gpg-sign', '-am', 'second');
    expect(guard('v1.2.3').status).not.toBe(0);
    expect(guard('v1.2.3').stderr).toContain('differs from build commit');
    inWork('tag', '--no-sign', '-a', 'v1.2.4', '-m', 'annotated'); inWork('push', '--quiet', 'origin', 'refs/tags/v1.2.4');
    expect(guard('v1.2.4').stdout.trim()).toBe(inWork('rev-parse', 'HEAD'));
    expect(guard('v1.2.5').status).toBe(0);
    expect(git('--git-dir', remote, 'rev-parse', 'v1.2.3')).toBe(oldHead);
    inWork('remote', 'set-url', 'origin', join(root, 'unavailable.git'));
    expect(guard('v1.2.5').status).not.toBe(0);
  } finally { rmSync(root, { recursive: true, force: true }); }
}, 30000);
