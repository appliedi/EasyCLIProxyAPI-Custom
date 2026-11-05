import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const stableTag = /^v[0-9]+\.[0-9]+\.[0-9]+$/;
const objectId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;

/** Reject an existing stable tag whose peeled commit differs from the build.
 * Missing tags may be created later; this function never changes a remote ref.
 * @param {string} tag Release tag, such as v0.4.3.
 * @param {string} buildCommit Commit checked out by both build and publish jobs.
 * @param {string} remoteRefs Output from git ls-remote --tags for this exact tag.
 */
export function assertStableTagTarget(tag, buildCommit, remoteRefs) {
  if (!stableTag.test(tag)) return;
  if (!objectId.test(buildCommit)) throw new Error('Invalid build commit');
  const refs = new Map();
  for (const line of remoteRefs.trim().split(/\r?\n/)) {
    if (!line) continue;
    const [sha, ref] = line.split(/\s+/);
    if (ref !== 'refs/tags/' + tag && ref !== 'refs/tags/' + tag + '^{}') continue;
    if (!objectId.test(sha)) throw new Error('Invalid remote tag object');
    refs.set(ref, sha);
  }
  const target = refs.get('refs/tags/' + tag + '^{}') ?? refs.get('refs/tags/' + tag);
  if (target && target !== buildCommit) throw new Error('Stable tag ' + tag + ' target ' + target + ' differs from build commit ' + buildCommit);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const tag = process.argv[2] ?? '';
  const buildCommit = execFileSync('git', ['rev-parse', 'HEAD^{commit}'], { encoding: 'utf8' }).trim();
  // A network/authentication failure throws; it must not look like an absent tag.
  const refs = stableTag.test(tag)
    ? execFileSync('git', ['ls-remote', '--tags', 'origin', 'refs/tags/' + tag, 'refs/tags/' + tag + '^{}'], { encoding: 'utf8' })
    : '';
  assertStableTagTarget(tag, buildCommit, refs);
  console.log(buildCommit);
}
