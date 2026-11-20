# Upstream v0.3.117 integration

Custom **1.3.117** incorporates upstream `4f0ba66a63435b45246f16c759091a52551c314c` (tag `v0.3.117`, Nov 19, 2026) in merge `f989956e487176d0eb43f154bc1b4869e5267648` on top of the unreleased 0.4.4 integration of v0.3.99 (`375bcbbf577de02911f4f329de1c7fdf92cebe08`), preserving both parents. The pinned core is upstream's 8.0.78. The only newer upstream work at merge time was one commit on `dev` (`0badaee0`, ACP account addition), which is not part of a release.

## Merge decisions

- **Versioning.** The app version is `1.3.117`, mirroring upstream `0.3.117`. Fork-only fixes use numeric build metadata (`1.3.117+1`). See [versioning](upstream-merges.md#versioning).
- **Conflicts (18 files).**
  - Release workflow: kept Windows-only matrix and the `bun test` gate; adopted the shared prebuilt-frontend job and the pinned Tauri CLI build without `beforeBuildCommand`.
  - Cargo manifest and lock: version `1.3.117`.
  - README: kept the custom README.
  - Locales (`en`, `zh-CN`, `ja`, `ru`): union of custom and upstream imports and keys.
  - `browserMockRuntime.ts`: union of custom storage/MCP/ZCode mocks and upstream ACP/system-prompt mocks; removed a now-unreachable duplicate `list_update_channels` case.
  - Routing panel: took upstream's redesign (`RoutingSnapshot`) and reapplied our theme tokens, CSS layer and Notice usage.
  - `PluginsPage.css`: one `@layer components` block (upstream's own fix in v0.3.106).
  - ZCode dialogs: took upstream's prompt editor and toolbar, keeping localized labels instead of hard-coded Chinese.
  - `styles.css`: upstream's compact version tile padding without a non-token radius.
  - Settings tests: categories now include both `sensitiveWords` (upstream) and `storage` (custom).
- **Update ownership.** The new automatic updater calls `app_update::resolve_app_update`, so desktop updates still come only from the validated `appliedi/EasyCLIProxyAPI-Custom` manifest. No upstream desktop URLs returned. Upstream-only workflows (`auto-retarget`, `miaomiao-preview`, preview publishing) stay gated on upstream's repository name.
- **Sensitive words.** Cloud rules download from this repository (`DEFAULT_URL` and `API_URL` in `sensitive_words.rs`). Fixed the bundled `codex` replacement typo ("Antigratity").
- **ZCode reasoning.** Adopted upstream `b47c295f`/`920d1850`: ZCode rejects an empty `reasoningLevel.values` list and drops the provider config, so manual rules get a low/medium/high fallback and catalog rules drop the spec. The 0.4.3-era test that required writing `values: []` now asserts the validity rule instead.
- **Claude Desktop.** Adopted upstream `b12866ec` (no `behavesAs`), reverting the 0.4.4 test expectations.

## Inherited upstream defects fixed here

| Area | Problem in pure v0.3.117 | Fix |
| --- | --- | --- |
| YAML alias writer | Since `18aafebb`, inserted nodes were serialized as JSON, producing flow-style one-liners in `config.yaml` and breaking alias routing tests | `core_config/yaml.rs` emits block YAML via `serde_norway`; JSON is kept only inside existing flow mappings |
| Antigravity usage (Windows) | Path text comparison and `"/chunks/"` matching failed with Windows separators, risking double counts or wrong retirement | Component-wise path comparison in `agent_usage_store.rs` |
| ZCode default model | `ordered_agent_models` always includes the requested model, so a deleted default was kept | Availability checked against the live model list |
| ZCode manual reasoning | An existing empty `values` list was not refilled | Refill empty lists for manual rules |
| Settings layout | Half-width orphan cards in Routing (after retry moved there in `7c58b5e3`) and Upstreams (new list field) | Pair only session routing with retry; OAuth groups take full rows |
| Windows tests | New tests deleted temp folders with SQLite handles open (os error 32) | `drop(connection)` before cleanup |

Stale upstream tests were updated to match intentional upstream behavior: retry in the Routing tab (`7c58b5e3`), catalog-scoped ZCode visibility (`7944f03d`), the ACP OAuth tab, the sensitive-word rule count (`83d8ca8d`), and the context-window positivity filter.

## Validation

- `bun run check`: passed.
- `bun test`: **1,494 passed, 32 skipped, 2 failed**. The failures are `tests/createMacosDmg.test.ts`, which shells out to `python`; Python is not installed on this Windows machine and the fork does not ship macOS builds.
- Full Windows Rust suite (`--test-threads=1`): **1,422 passed, 0 failed, 24 ignored**. For comparison, pure upstream v0.3.117 built in a separate worktree on the same machine: 1,341 passed, **54 failed**, 24 ignored.
- Core 8.0.78 Windows amd64 archive verified against official checksums: `9b87222ccc4e9705193fcfe6ebb1fcd08154987b30d43e80cd03326bbc875831`.
- Real-core API suite with an isolated 8.0.78 core and fake upstreams: 28 passed, 0 failed. Priority/affinity integration passed, including TTL renewal and idle expiry.
- Custom browser suites passed: quota dashboard with priority and affinity, Subscription Value with fee persistence, storage scheduling/backup/restore, settings (ten categories, search, drafts, responsive layouts), and automatic updates.
- Upstream browser suites that fail identically on pure v0.3.117 and were not changed here: `home-dashboard-ui`, `usage-panels-layout-ui`, `theme-ui`, `plugins-ui`, `plugin-sidebar-ui`, `api-access-layout-ui`, `responsive-layout-ui`, `app-shell-accessibility-ui`.

## Build artifacts and status

- The Windows x64 production build passed with `./build.ps1 -SkipCopy -BuildJobs 8`. The executable reports file and product version 1.3.117. Existing nonfatal compiler warnings remain.
- `./build-installer.ps1 -SkipBuild` produced the 1.3.117 Setup.exe with the verified core 8.0.78 archive.
- The portable folder contains only `EasyCLIProxyAPI.exe`, `portable-app.json`, `core-version.txt` and `cpa-core/CLIProxyAPI_8.0.78_windows_amd64.zip`. No user data, credentials or configuration is included.
- Local artifacts under `.codex/builds/`:
  - `EasyCLIProxyAPI-v1.3.117-Windows-amd64-setup.exe`: SHA-256 `3b46e0a1ae1f51d350033d971f6fa792107065ddb49f275a44f4fd16ebc83c0c`.
  - `EasyCLIProxyAPI-v1.3.117-Windows-amd64.zip`: SHA-256 `34e2c1166caa5486a1b2cd27b26dcaee50eeb5a444c710b67e6163817acb6606`.
- Not done locally: the isolated installer smoke test, the ARM64 build (configured for CI), and code signing (packages are unsigned). The active installation was not replaced. Nothing was pushed or published.
