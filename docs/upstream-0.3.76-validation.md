# Upstream v0.3.76 integration validation

Integration date: 2026-11-05. Custom checkpoint: d09537044137d30f3c520ba0053b1ad5d8bad9b4.
Upstream release: v0.3.76, commit 027cdb94d228907a3922d807d5790b52d0d08600.
Pinned core: official CLIProxyAPI 8.0.52. Desktop version: 0.4.2 (Unreleased).

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

## Remaining failures and release gate

This integration is not a clean-suite release candidate. No release is published or tagged.

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

ARM64 compilation, a fresh installer smoke test, and release asset/manifest publication were not performed for this integration. Resolve or explicitly disposition the inherited failures and run packaging validation before a release tag.
