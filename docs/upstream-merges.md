# Upstream merge guide

The changelog supplies context; preserving ancestry and reviewing overlapping changes keeps merges manageable. Follow this guide together with [CONTRIBUTING.md](../CONTRIBUTING.md).

## Repository ownership

| Purpose | Repository |
| --- | --- |
| `origin`: custom source and desktop releases | `appliedi/EasyCLIProxyAPI-Custom` |
| `upstream`: desktop source to merge | `router-for-me/EasyCLIProxyAPI` |
| Official proxy core releases | `router-for-me/CLIProxyAPI` |

Do not use the official desktop updater to update this custom distribution. Desktop manifests, release/download URL validation, release-page links, and model-catalog URLs must stay on `origin`. Core download URLs remain official. Preserve the upstream MIT license and attribution.

Use separate refs for upstream releases: our `v*` tags trigger our releases and may eventually share names with upstream tags. Do not run `git fetch upstream --tags` or push all local tags to `origin`.

## Current merge record

| Field | Value |
| --- | --- |
| Custom release | `0.4.0` |
| Upstream desktop release | `v0.3.22` |
| Upstream commit | `56a88ccb6f9128793a810b2bb17a474dade2939b` |
| Core version | `8.0.15` |
| Custom pre-merge checkpoint | `5d5bab29e68145dc1d2f731940089476f8c0f691` |
| Merge commit | `dbd0a11de81739168c2e3355ac57ed4275d9202f` |

The merge had conflicts in `src/pages/QuotaPage.tsx`, `src/pages/QuotaPage.css`, `src/mocks/browserMockRuntime.ts`, and `tests/quotaRendering.test.tsx`. We combined the dashboard with upstream reset/expiry behavior, preserved ledger layout, and adopted the expanded upstream quota mocks. Do not resolve future conflicts by replacing any of these files wholesale.

## Customization map

| Area | Files to inspect | Behavior to preserve |
| --- | --- | --- |
| Dashboard | `src/pages/QuotaPage.tsx`, `src/pages/QuotaPage.css`, `src/services/quotaSummary.ts` | Filters, reporting coverage, independent quota windows, ledger/cards, search/sort, scoped refresh; unavailable quota is not zero |
| Account routing | `src/components/AccountRoutingPanel.tsx`, quota page, upstream auth-file settings services | Integer priority editing; save only affinity fields; retain routing strategy and other configuration |
| Translations | `src/i18n/locales/en.ts`, `src/i18n/locales/zh-CN.ts`, `src/i18n/ja.ts` | `quota.routing.*` and custom dashboard strings; traditional Chinese derives from existing translation handling |
| Release ownership | `src-tauri/src/main.rs`, `src-tauri/src/app_update.rs`, `src/pages/VersionManagementPage.tsx`, `scripts/manifest.mjs`, browser mock | Custom desktop URLs, repository validation and catalog source; official core URLs |
| Builds | `.github/workflows/release.yml`, `build.ps1`, `build.sh`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` | Independent version, no inherited desktop mirror, both Windows architectures, checksummed manifests |
| Core compatibility | `src/services/oauthModelSettings.ts` | JSON null means an unset exclusions map; malformed values still fail; preserve sibling providers |
| UI/test portability | `AuthFileUsageSummary.tsx`, `HomeAccessPanel.tsx`, `tests/textContrast.test.ts`, Rust process-discovery tests | Usage explanation, localization, line endings, bounded Windows cleanup retry |
| Regression checks | `tests/quotaSummary.test.ts`, `tests/quotaRendering.test.tsx`, `tests/quota-dashboard-ui.cjs`, `tests/account-routing.v8.integration.cjs`, updater tests | Custom features and update-source isolation |

Priority and affinity selection are implemented by the official core, not by a modified core in this repository. Retest them when changing `core-version.txt`. Affinity is session/provider/model scoped, not shared automatically by all chats in a project.

## Merge procedure

1. Check for local changes. Commit or otherwise preserve them before beginning; never discard user changes to obtain a clean tree. Work on a `codex/` branch.
2. Fetch the desired upstream release into its own namespace. For example:

   ```powershell
   git fetch upstream --no-tags
   git fetch upstream --no-tags refs/tags/v0.3.22:refs/remotes/upstream/releases/v0.3.22
   git show -s --format='%H %s' refs/remotes/upstream/releases/v0.3.22
   ```

   Substitute the intended new release. Record its resolved commit, not just the tag name.
3. Review upstream commits and diffs since the recorded base. Compare our changes against that base with `git diff <recorded-upstream-commit> HEAD -- <paths>`. Check management API changes, quota schemas, update validation, and core configuration migrations.
4. Merge the resolved release ref using `git merge --no-ff --no-commit <ref>`. Resolve overlaps deliberately. Keep the merge ancestry; do not squash away the upstream relationship.
5. Review the customization map. If upstream now supplies an equivalent feature, remove redundant custom code only after its behavior and migration are verified, and record that decision in the changelog.
6. Run the checks below. Fix actual failures; explain environmental failures and reruns precisely. Never change tests merely to hide a lost feature.
7. Update `CHANGELOG.md` under Unreleased with the upstream version/commit, core version, retained or replaced features, conflict decisions, and test evidence. Update this guide's base record after the merge commit exists.
8. Commit and push the merged source. Prepare a separate release entry and localized release notes before tagging. Published tags are immutable; fixes after publication get a new version.

## Validation and release checklist

- `bun run check` and `bun test`.
- Set `CPA_V8_TEST_CORE` to an isolated copy of the intended official executable, then run `bun test tests/coreOperations.v8.integration.test.ts tests/managementApi.v8.integration.test.ts` and `node tests/account-routing.v8.integration.cjs`. These use local fake upstreams, not production accounts.
- Run `node tests/quota-dashboard-ui.cjs` with Playwright available, and inspect the light/dark/narrow screenshots it writes under `.codex/quota-dashboard/`. The browser tests use fictional accounts.
- Run `cargo test --manifest-path src-tauri/Cargo.toml --bin cpa-gui -- --test-threads=1` on Windows. Process-spawning tests can time out under heavy parallel load; report any ignored tests or necessary reruns.
- Build with `./build.ps1 -SkipCopy -BuildJobs 8`. Do not overwrite a running installation during build verification.
- Verify that desktop manifests and the download page point to our repository and that the updater rejects upstream desktop manifests. Check that no upstream GUI mirror defaults returned during the merge.
- Bump with `node scripts/set-version.mjs <version>`; maintain matching `Cargo.toml`/`Cargo.lock` versions and `core-version.txt`. Move Unreleased changes into the dated changelog entry and add `docs/release-notes/v<version>/{en,zh-CN,zh-TW,ja}.md`.
- Push only the intended tag. Confirm GitHub Actions succeeds and the latest manifest references existing assets for both Windows architectures with matching hashes/sizes. If the tag push does not start a run, inspect Actions before dispatching the workflow manually; avoid duplicate publication.
- Packages must contain application files and the verified core archive, never real OAuth files, local configuration, runtime logs, or API keys. Preserve those separately when installing.
