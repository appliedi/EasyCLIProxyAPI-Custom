# Changelog

This file records changes specific to **EasyCLIProxyAPI Custom**. Upstream history stays in Git; this log records what we incorporated, preserved, or changed. Dates use America/New_York.

Every functional change must update **Unreleased** in the same commit or pull request. Before publishing, move those entries under the new version and date. Never rewrite an existing release entry to describe later work.

## Unreleased

No changes yet.

## 0.4.1 — 2026-10-05

### Navigation

- Moved the custom dashboard to its own **Subscription Usage** sidebar item and page title. The upstream **Quota Lookup** page remains available separately.
- Isolated the custom page and styles in `SubscriptionUsagePage.tsx` and `SubscriptionUsagePage.css`, reducing future merge conflicts in upstream quota files.
- Both pages continue to share quota cache data; account priorities, affinity controls, filters, summaries, and ledger/card views remain on Subscription Usage.
- Updated English, Chinese, and Japanese labels and the customization map.

### Validation

- TypeScript and all 703 frontend tests passed (32 isolated-core tests/hooks skipped).
- The dashboard browser regression passed, including navigation between both pages, cache reuse, priority editing, affinity settings, scoped refresh, layout persistence, and responsive layout.
- No proxy core or routing logic changed; the bundled core remains 8.0.15.

### Maintenance

- Added this changelog and the [upstream merge guide](docs/upstream-merges.md), including a customization map, merge history, and validation requirements.
- Added a pull request checklist for changelog updates, merge records, and validation.
- Documented separate upstream release refs so upstream tags cannot collide with this distribution's release tags.

## 0.4.0 — 2026-10-05

### Upstream base

- Desktop: upstream `v0.3.22`, commit `56a88ccb6f9128793a810b2bb17a474dade2939b`, merged in `dbd0a11de81739168c2e3355ac57ed4275d9202f`.
- Bundled proxy core: official CLIProxyAPI `8.0.15`, upgraded from `8.0.6`.
- Incorporated upstream management API/configuration fixes, credential management, plugins, usage views, and Claude quota reset support.

### Preserved custom behavior

- Provider filters, quota summaries with reporting coverage, selectable quota windows, ledger/card views, account search and sorting, and refresh of visible accounts.
- Account priority editing from the quota page; higher values are preferred for new bindings.
- Session affinity controls and idle timeout. Existing bindings take precedence over priority; affinity remains scoped to session/provider/model and does not guarantee provider cache retention.

### Independent distribution

- Created `appliedi/EasyCLIProxyAPI-Custom` with the original repository retained as `upstream`.
- Changed desktop update manifests, release links, allowed download/release URLs, and the model catalog to our repository. Official core downloads remain at `router-for-me/CLIProxyAPI`.
- Removed upstream GitCode mirror defaults from local builds; retained explicit optional mirror configuration.
- Added Windows x64 and ARM64 release publishing with checksummed update manifests. Set the app version to `0.4.0` and window title to `EasyCLIProxyAPI Custom`.
- The first upgrade from custom `0.3.6` requires manual package replacement because its updater still points to the original desktop repository. Preserve user configuration and OAuth data.

### Fixes and merge resolutions

- Combined upstream quota resets and credit expiry details with the custom ledger and priority controls; retained upstream's expanded mock providers.
- Accepted a JSON `null` model-exclusion map from a fresh v8 core while continuing to reject malformed non-map values.
- Restored the cumulative-usage explanation, localized the API base URL label, and aligned stale UI assertions with upstream's switch controls and technical labels.
- Made CSS test matching tolerate Windows line endings and retried transient Windows file locks during process-discovery test cleanup.
- Added regression coverage rejecting desktop update manifests from the original repository.

### Validation

- TypeScript check and optimized Windows x64 build passed.
- Frontend suite: 703 passed, 32 isolated-core tests/hooks skipped in each GitHub Windows build; isolated-core integrations were run separately locally as described below.
- Real core `8.0.15`: all 28 management/provider integration tests passed across the initial run and targeted retry after the null-map fix.
- Routing integration passed: priority selection, active binding retention, failover, sliding idle timeout, and reselection after expiry.
- Dashboard browser test passed: summaries, filters, scoped refresh, priority validation/persistence, affinity saving, layouts, and narrow widths.
- Rust suite: 740 initially passed, 8 ignored. Four process-start timing failures passed when rerun serially; the remaining cleanup test passed after the Windows lock retry fix.
- [Release workflow 37331204556](https://github.com/appliedi/EasyCLIProxyAPI-Custom/actions/runs/37331204556) passed for Windows x64 and ARM64 and published [v0.4.0](https://github.com/appliedi/EasyCLIProxyAPI-Custom/releases/tag/v0.4.0). The live latest-update manifest was fetched and both asset URLs, byte sizes, and SHA-256 values matched GitHub's uploaded release asset metadata.

## 0.3.6-custom — 2026-10-05

This was a local distribution, not a release in the new GitHub repository.

- Based on upstream commit `90364e9` and bundled core `8.0.6`.
- Added the custom quota dashboard, priority editor, session-affinity controls, translations, and regression tests.
- Preserved these changes in commit `5d5bab29e68145dc1d2f731940089476f8c0f691` before merging upstream.
