# Changelog

This file records changes specific to **EasyCLIProxyAPI Custom**. Upstream history stays in Git; this log records what we incorporated, preserved, or changed. Dates use America/New_York.

Every functional change must update **Unreleased** in the same commit or pull request. Before publishing, move those entries under the new version and date. Never rewrite an existing release entry to describe later work.

## Unreleased

## 0.4.3 — 2026-11-05

### Review follow-up

- Reject stable release tags whose peeled commit differs from the source being built. Publishing checks out the same source reference as the build jobs and uses the verified checkout commit when creating a tag; an existing stable release is still immutable.

- Keep distinct nameless historical subscription accounts from aliasing unrelated OAuth or unknown-auth requests. Added a regression for both cases.
- Preserve the initial portable-data hint and autostart registration through Tauri `/UPDATE`; normal uninstall removes only recognized commands belonging to that installation, including `--autostart`. Expanded the real installer smoke test to cover both update cycles and unrelated startup-entry preservation, with a configurable isolated registry key for local runs.
- Show Windows storage startup errors with a native message box instead of constructing another WebView; retain the existing dialog on other platforms.
- Validate PR base-branch changes by retaining the edited trigger. Metadata edits conservatively rerun builds rather than allowing skipped required jobs to mask failures.
- Make isolated installer smoke bundles reproducible with a repository builder and SHA-256-bound identity manifest; reject unpaired registry/product overrides before side effects.

### Release fixes and validation

- Release as **0.4.3** so existing local **0.4.2** development installations receive an update. No public 0.4.2 tag is created.
- Fixed all inherited frontend failures: shared controls, themed CSS layers/tokens, notices/empty states, translated ZCode/MCP UI, regenerated schema line endings, and missing browser mock IPC contracts. Added MCP/ZCode mock round-trip regressions; retained narrow documented exceptions for inline live regions and row controls.
- Preserve explicit ZCode context windows and disabled/empty reasoning overrides instead of replacing them with catalog defaults. Fixed Windows regression fixtures by closing SQLite handles before cleanup, keeping PowerShell arguments out of executable source, and comparing paths structurally. Excluded generated build assets from the settings browser watcher to avoid Windows file-lock failures during packaging.
- Replaced shell-dependent release-version resolution with a tested portable Node resolver; validate unsafe tags and retain immutable stable publication.
- Full frontend suite: **1,296 passed, 32 skipped, zero failed**. Full Windows Rust suite: **1,157 passed, 13 ignored, zero failed**. The isolated 8.0.52 core API/routing tests pass. Production builds, browser regressions, and installer preservation checks are recorded in the [validation report](docs/upstream-0.3.76-validation.md).

### Upstream integration — v0.3.76

- Merged upstream desktop **v0.3.76**, commit `027cdb94d228907a3922d807d5790b52d0d08600`, from the previous v0.3.22 base. The pinned official CLIProxyAPI core advances from **8.0.15** to **8.0.52**. Custom desktop release is **0.4.3**.
- Incorporated upstream quota/provider improvements, agent discovery performance fixes, client configuration updates, Agent usage history, routing, MCP/skills management, themes, reverse proxy, and updater/runtime fixes.
- Retained separate Subscription Usage and Subscription Value pages, priority and affinity controls, effective-dated fees, pricing/attribution semantics, persistent storage/profile locks, graceful restarts, and the Windows installer. Adapted custom controls to upstream shared components and theme layers.
- Extended verified storage snapshots to include agent usage, MCP servers, skill state, theme/custom-theme settings, usage-view preferences, and privacy settings. Agent SQLite snapshots use the backup API to retain committed WAL data without copying live WAL/SHM files.
- Resolved 18 conflicted files by combining custom features with upstream dependencies/runtime commands, retaining fail-closed storage startup and our independent version. Desktop stable/preview update URLs and catalogs stay on appliedi/EasyCLIProxyAPI-Custom; core downloads stay official. Windows x64/ARM64 ZIP and Setup packaging remain. Disabled upstream PR retargeting in this fork, removed automatic core-version drift in release CI, and protected published stable releases from retagging/republication.
- Validation and known upstream test failures are recorded in [the integration report](docs/upstream-0.3.76-validation.md). The local installed app is not replaced during release verification.

### Windows installer

- Released version **0.4.3** with a standard per-user NSIS **Setup.exe** alongside portable ZIPs. Setup creates Start Menu/optional desktop shortcuts and a Windows Installed Apps entry, includes the proxy archive, and installs WebView2 when needed.
- Fresh installed copies default to the separate per-user data folder. Setup can select an existing portable folder before first launch; already registered storage locations always take precedence. Install/reinstall/uninstall preserve usage, fees, settings, credentials, and non-packaged files.
- Require a graceful app exit before Setup or uninstall, including silent runs, instead of Tauri's default force-kill behavior. Remove only this installation's matching autostart registration.
- Keep the updater-compatible `EasyCLIProxyAPI.exe` filename and portable manifest. In-app updates continue using ZIPs and preserve the installation marker. Installer resources use an exact allowlist and a verified core checksum, excluding user data.
- Added `build-installer.ps1`, x64/ARM64 installer and checksum assets to the release workflow, Windows installation/reinstallation/uninstallation smoke checks, and installer documentation. Signing is not configured; locally built installers are unsigned. The release includes both portable ZIP and Setup packages.
- Validation: built the x64 0.4.2 Setup.exe and verified its version and SHA-256 sidecar. An isolated installer identity passed real Windows install/reinstall/uninstall tests, including retaining the original portable selection and unchanged sample data inside/outside the install directory. All 18 storage regressions, updater replacement/rollback preservation, and 707 frontend tests passed (32 existing integration tests/hooks skipped). ARM64 packaging is configured for CI but was not built locally. The active portable installation was not replaced.

### Storage and upgrade persistence

- Added **Advanced Features → Storage & backups** with portable, recommended per-user, and custom data locations, an active-folder shortcut, scheduled backup/restore, and the existing history-size limit (`0` retains all recorded history).
- Persist the selected data location outside release packages, so future Custom builds extracted elsewhere reopen the same usage database, fees, prices, settings, and credentials. First launch registers the existing installation without moving data. The first storage-aware upgrade must be installed in the existing application folder; older builds cannot use this preference.
- Copy and verify data at restart before writers start, using SQLite's backup API for committed WAL records and SHA-256 checks for files. Include external OAuth credentials and rebase the copied configuration. Switch locations only after verification; retain the original folder. Restore verifies a backup into a new folder without merging histories or overwriting current data.
- Lock the shared data profile across executable locations, stop startup when its folder or identity is unavailable, and reject invalid configuration instead of falling back to fresh defaults. Failed copies leave the original profile active and report the failure. Scheduled copies are deferred during updater startup acknowledgment.
- Preserve graceful proxy shutdown before storage restarts and prefer the new executable's bundled core version when data lives elsewhere. Extend update/rollback preservation tests to cover profile markers and databases.
- Document migration, backup scope, first-upgrade requirements, and recovery in `docs/data-storage.md`; add the storage customization to the upstream merge map. Backups are manual, contain credentials, and do not include external client files or browser preferences.
- Validation: all 766 Rust tests passed (8 existing integration/helper tests ignored), including 16 new storage regressions; TypeScript and all 707 frontend tests passed (32 isolated-core tests/hooks skipped). The storage UI and complete English/Chinese settings-layout browser checks passed. `build.ps1 -SkipCopy -BuildJobs 8` produced an optimized Windows executable; the running installation and its data were not replaced.

### Subscription Value

- Added a separate **Subscription Value** sidebar page with monthly API-equivalent estimates by routed OAuth account and model, a cumulative daily chart, pricing coverage, and optional USD subscription-fee comparisons. Idle connected accounts remain visible; Antigravity model usage stays under its Antigravity account.
- Save fees in the local usage database with an effective month. Changes carry forward until the next saved change and do not rewrite earlier months. Blank fees are unknown; explicit zero fees are distinct. Portfolio value ratios only include accounts with entered fees.
- Aggregate retained usage in SQLite without event-page limits. Reuse existing model pricing, cache accounting, service-tier and long-context adjustments. Missing required prices are excluded and disclosed rather than treated as zero cost. Estimates use the active price catalog, so changing prices recalculates history.
- Keep API-key and unattributed traffic out of subscription totals. Saved accounts and history remain available while the core is offline. No OAuth, routing, or proxy-core configuration changes are required.
- Added English, Chinese, and Japanese strings, browser mock data, and regression coverage for account attribution, fee history, missing rates, large histories, model/day reconciliation, and responsive interactions.
- Validation: TypeScript and all 707 frontend tests passed (32 isolated-core tests/hooks skipped); all 77 Rust usage tests passed, including five new subscription-value tests. The isolated browser regression passed for account/model drilldowns, fee validation and persistence, month changes, narrow layouts, offline navigation, and empty/error states. An optimized Windows build passed with `build.ps1 -SkipCopy -BuildJobs 8`; the running installation was not replaced.

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
- [Release workflow 37333933738](https://github.com/appliedi/EasyCLIProxyAPI-Custom/actions/runs/37333933738) passed for Windows x64 and ARM64 and published v0.4.1. The live update manifest matched both uploaded packages' URLs, sizes, and SHA-256 digests.

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
