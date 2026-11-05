# Upstream v0.3.76 integration validation

Integration date: 2026-11-05. Custom checkpoint: d09537044137d30f3c520ba0053b1ad5d8bad9b4.
Upstream release: v0.3.76, commit 027cdb94d228907a3922d807d5790b52d0d08600.
Pinned core: official CLIProxyAPI 8.0.52. Initial integration desktop version: 0.4.2 (Unreleased). Release follow-up: 0.4.3.

## Preserved behavior and resolutions

The merge preserves upstream ancestry and the MIT license. Eighteen files conflicted: release workflow, Cargo dependencies, main runtime, updater and updater tests, Tauri window configuration, quota rendering tests, settings browser tests/navigation/page, translations, browser mocks, navigation, home access tabs, version management, and credential usage summary.

Dependencies combine upstream networking/TLS features with SQLite backup support. Runtime initialization keeps fail-closed profile validation, profile locking, graceful shutdown, deferred storage operations during updater acknowledgment, and new-executable bundle precedence. Both upstream runtime commands and custom storage/subscription commands remain registered.

Subscription Usage and Subscription Value remain separate from upstream Quota Lookup. Priority/affinity controls, fee history, account attribution, missing-price handling, and offline value reporting remain. Custom controls use shared switches/selects and CSS layers. Mock assertions follow upstream's added Kimi account and renamed quota windows; they still exercise the underlying custom behaviors.

Snapshots include the new agent SQLite database, MCP roster, skill state, theme selection/custom themes, usage-view and privacy preferences. Regression tests proved missing-file and live-WAL failures before the snapshot fixes. SQLite backup produces a standalone agent database, excluding WAL/SHM files, and restores committed records.

Desktop stable/preview manifests, release URLs and model catalog remain owned by appliedi/EasyCLIProxyAPI-Custom. Official core URLs remain router-for-me/CLIProxyAPI. The Windows x64/ARM64 ZIP and Setup workflow remains; upstream automatic core-version lookup is omitted so CI packages the tested pin. Upstream main-to-dev PR retargeting is guarded to its own repository. Existing stable releases cannot be retagged or republished by the merged workflow.

## Passing verification

- Baseline custom TypeScript check and frontend suite: 707 passed, 32 skipped.
- Merged TypeScript check passed.
- Focused frontend regressions: 59 passed (quota summary/rendering, subscription value, OAuth model settings, custom update manifest ownership and template settings).
- Official 8.0.52 core: 28 API integration tests passed; account-routing integration passed priority, active/failover bindings, activity renewal and idle expiry.
- Downloaded Windows x64 core archive SHA-256 matched official checksums: 395324dd124bd657bccd5fdf06119587cd7c87bddacff191d5f45431e8f08d23.
- Rust storage: 19 passed, including new upstream-data backup/restore and agent WAL coverage.
- Rust updater: 40 passed, including custom repository rejection and startup acknowledgment.
- Rust usage: 108 passed, including subscription value.
- Dashboard browser regression passed priority validation/editing, affinity settings, scoped refresh, saved layouts, shared quota-cache navigation and responsive widths; light/dark/narrow screenshots inspected.
- Storage and Subscription Value browser regressions passed scheduling/cancellation, restart/error flows, account/model drilldown, fee persistence, offline/empty states and responsive layouts.
- English/Chinese settings browser regression passed all nine categories and six viewport sizes.
- Windows optimized build command: ./build.ps1 -SkipCopy -BuildJobs 8. The active installation and user profile are not replaced. Build emits one inherited unused scale_factor warning.

## Initial integration failures (resolved for 0.4.3)

The initial integration checkpoint was not a clean-suite release candidate and was not tagged. The release follow-up below resolves these failures.

Unmodified upstream v0.3.76 was extracted separately and tested against the same installed dependencies: 1,250 passed, 32 skipped, 25 failed. The merged full frontend suite with a 20-second timeout for source-scanning tests reports 1,269 passed, 32 skipped, 23 failed. Every remaining failure name also occurs in the unmodified upstream baseline. The two upstream quota-priority failures are resolved by targeting the custom card that retains that feature. A default-timeout run additionally timed out in the token-consumer source scanner under concurrent compilation; the longer-timeout run completed it.

Remaining frontend failure names:

- shared binary controls > rejects handwritten switch classes, roles and unlisted native checkboxes
- shared button controls > keeps page stylesheets from restyling buttons
- shared button controls > requires a shared button class on every <button> and rejects retired private classes
- CSS layer architecture and specificity regression > prohibits !important across all src CSS stylesheets
- CSS layer architecture and specificity regression > ensures all src CSS files belong to a declared layer without unlayered style escape
- CSS tokenization and theme variable lint > prohibits color literals, unregistered --theme-* variables, non-tier radius, and !important outside tokens layer
- i18n > does not include untranslated Chinese prose in English messages
- service IPC commands are registered and have browser mock contracts
- release version resolution workflow > supports non-semver preview tags such as only-preview
- release version resolution workflow > normalizes bare semver to v-prefixed tag
- release version resolution workflow > preserves v-prefixed semver tag
- release version resolution workflow > defaults to source version when requested version is empty
- release version resolution workflow > resolves rolling miaomiao preview tag and version
- release version resolution workflow > resolves pull request tag and version
- reverse proxy contract and settings card > includes all required i18n keys across all locales in settingsMessages
- reverse proxy contract and settings card > contains the security warning mentioning 127.0.0.1, trusted-proxies, and allow-remote: false
- shared select controls > keeps native selects in Select and popup roles in the listed owners
- Stage 2 acceptance fixes regression > P2-1: dark usage collector has no border and preserves toolbar dimensions
- shared empty states and notices > keeps private empty-state classes on EmptyState only and rejects new ones
- shared empty states and notices > keeps role alert and status in Notice and an explicit exception list
- shared container surfaces > keeps migrated container appearance in the shared stylesheet
- theme token contract > generated theme.schema.json matches the contract
- UI localization boundaries > routes visible prose and accessibility labels through translations

The full serial Windows Rust run reported 1,131 passed, 25 failed, 13 ignored. The failures are in upstream agent usage store fixtures (19 remove_dir_all calls while SQLite connections remain open on Windows), PowerShell harness restart fixtures (4 script parsing/launch failures), MCP sync path separator comparison (1), and ZCode model-context expectation (1). These files are unchanged from upstream; a separate full upstream Rust build was not run. The ZCode mismatch needs investigation before release; it is not classified as an environmental failure. Focused custom storage, updater and usage checks pass as listed above.

ARM64 compilation, a fresh installer smoke test, and publication were pending at the initial integration checkpoint. These are release-stage checks, separate from the initial merge.

## Release follow-up — 0.4.3

The release fixes all recorded failures rather than excluding them. Version 0.4.3 supersedes the existing local 0.4.2 development installation so its updater can offer the new build.

- Full frontend suite: `bun test --timeout 20000` — **1,296 passed, 32 skipped, zero failed**. TypeScript check passed. The skips are the existing optional isolated-core tests/hooks; the 28 API integration tests were also run explicitly against the verified official 8.0.52 executable and passed, as did account routing.
- Full serial Windows Rust suite — **1,157 passed, 13 ignored, zero failed**. The ignored cases remain the existing integration/helper entries.
- Fixed ZCode production precedence for explicit context and disabled/empty reasoning settings. Fixed Windows SQLite cleanup and PowerShell/path fixtures without skipping tests.
- Fixed UI/CSS/localization contracts, shared controls/notices/empty states, generated-schema line endings, and missing MCP/skills/ZCode/update-channel browser mocks. Narrow inline live-region/row-control exceptions are documented in their regression inventories. New round-trip mocks retain caller isolation and persistence behavior.
- Replaced shell-dependent workflow version resolution with a portable Node module tested against fixed version/time fixtures and the CLI output contract. Stable tags/releases remain immutable.
- Independent backend/tooling and frontend/release-path reviews found no blocking issues. The frontend reviewer independently ran 40 passing tests.
- Dashboard, Storage & backups and Subscription Value browser regressions passed again on the release source. Windows optimized build and isolated installer install/reinstall/uninstall validation precede tagging. The installed app, existing registry identity and data locator are not changed by local validation.

Release packaging evidence: the optimized Windows x64 0.4.3 executable built successfully. The ship-ready x64 Setup.exe and SHA-256 sidecar were built. A separate installer product/binary/profile namespace passed real install, reinstall and uninstall tests, retaining portable selection and unchanged fixture data. This avoided the existing installed Custom product and saved locator. Its payload allowlist contains only the application, portable manifest, core version and verified core archive.

The comprehensive settings browser test initially hit a Windows EBUSY file-watcher error while packaging wrote generated core archives. Its Vite watcher now excludes .codex, src-tauri and cpa-core outputs, matching the other browser harnesses.

The final English/Chinese settings browser rerun passed all nine categories across six viewport sizes after excluding generated build outputs from its watcher. The release source has zero failures in both full unit suites and the custom browser regressions.

## CodeRabbit review follow-up

Review-only PR #2 compares the Custom head with exact upstream v0.3.76; main integration PR #1 retains the complete upstream import. CodeRabbit reviewed 112 selected files (the lockfile was excluded by its defaults). Three findings were confirmed and reproduced before fixes: nameless account alias attribution, lost initial data hints during `/UPDATE`, and missed uninstall cleanup of `--autostart`.

The new alias regression failed before the SQL filter and now passes for OAuth and unknown-auth cases. The installer test failed first on a lost `/UPDATE` hint, then on the leftover startup command. The fixed hooks preserve both owned autostart and the portable-data hint through updates, retain foreign startup targets, and clean owned entries on normal uninstall. The smoke harness can use a separate registry namespace and snapshots unrelated entries to ensure preservation. Final affected verification: all six subscription-value Rust tests and the full serial Windows Rust suite (**1,158 passed, 13 ignored, zero failed**); the isolated expanded installer smoke passed. Windows startup error handling now uses MessageBoxW without another Tauri/WebView instance.
