# Storage and upgrade persistence

Open **Advanced Features → Storage & backups**. The page shows the active data folder and offers:

- **User data folder (recommended):** `%LOCALAPPDATA%\EasyCLIProxyAPI-Custom\data` on Windows. Application packages and personal data are separate.
- **Application folder (portable):** a `data` subfolder alongside the executable. Copy the whole application folder when taking it to another computer.
- **Custom folder:** an absolute path whose parent already exists. Use a new folder name; the app never merges into or overwrites an existing folder.
- **History retention:** the existing usage database size limit. `0` retains all recorded events. A positive limit deletes the oldest events when the limit is exceeded, including history used for Subscription Value. Changing this limit also changes the limit shown on the Usage page.
- **Backup and restore:** verified snapshots of settings, credentials, usage, subscription fees, prices, the installed core and plugins, and local agent state/backups inside the data folder.

## First upgrade from an older build

For a portable upgrade, install the first build with this feature **in the existing permanent application folder**, preserving its data (for example, `C:\Users\<you>\Apps\EasyCLIProxyAPI`). On its first launch, the app registers that existing folder without moving or resetting its contents. You can then select the recommended per-user location and schedule a copy.

Alternatively, use [Windows Setup.exe](windows-installer.md): choose **Yes** when asked about an existing portable copy, then select that folder. The installed app will register and reuse it. Fresh installed copies default to the per-user data folder.

Older versions such as 0.4.1 do not know about the saved storage location. Launching an older build, or launching the first storage-aware build from an empty folder before registering the existing installation, does not discover history in arbitrary other folders. Do not delete the existing installation to upgrade.

## What survives an upgrade

The location is saved outside release packages in `%LOCALAPPDATA%\EasyCLIProxyAPI-Custom\storage.json`. This preference applies to storage-aware Custom builds for the same operating-system user, including packages extracted into different directories. The active folder has a `storage-profile.json` identity marker. Neither file is a release asset.

On macOS the locator is in `~/Library/Application Support/EasyCLIProxyAPI-Custom`; on Linux it is in `$XDG_DATA_HOME/EasyCLIProxyAPI-Custom` (or `~/.local/share/EasyCLIProxyAPI-Custom`). Existing macOS data stays in its original Application Support directory until explicitly moved.

The desktop updater still replaces only application release files and bundled core assets. It leaves data and the saved location alone. Bundle discovery checks the new executable's bundled version before a separate data directory, so moving data does not pin future core upgrades to an old bundle.

New builds open the same `usage-records/usage.db`. Subscription fees and prices are in that database along with usage events; they are not inferred from a session or kept only in browser memory. Account credentials are copied too, so a storage change does not itself require signing in again. Providers can still expire or revoke credentials independently.

## How a storage operation works

1. Choose a destination and schedule the operation. The pending destination is shown, and you can cancel it or choose **Restart & apply**. Scheduling does not change the active folder.
2. The app follows its normal proxy shutdown path before restarting. At the next start, before configuration and usage writers run, it locks the profile and copies the data. It refuses to copy while a managed proxy from that folder is still running. A pending operation is deferred during the desktop updater's startup-acknowledgment window.
3. SQLite's backup API includes committed WAL data. Other files are copied and checked with SHA-256; the copied database gets an integrity check. Configured external OAuth credentials are included and the copied configuration is rebased to `../oauth` in the new folder. The external originals are retained.
4. A move or restore switches the locator only after verification succeeds. The entire original folder is retained as a recovery copy. Restoring a backup creates a new profile; it does not merge histories or overwrite the current profile.
5. If copying fails, the old folder stays active and the error appears in Storage & backups. Incomplete destinations are left for inspection and are not reused automatically. Choose a different new destination when retrying. If the selected source folder is missing, has the wrong identity, or contains an invalid GUI configuration, startup stops instead of creating replacement data.

The preference is shared between builds, and different executables cannot simultaneously open the same profile. If you move a portable folder to a different path on the same computer outside the app, the saved location still points to its old path; use the app's location controls for relocation.

## Backups and recovery

A completed backup contains `storage-backup.json` with file hashes and the creating app version. Restore rejects changed or missing files, unsafe paths, links/junctions, and backups from newer app versions. Keep backups private: they contain API keys and OAuth sign-in secrets. Backups are scheduled manually; they are not automatically created on every upgrade.

Snapshots include the data-folder entries `config.toml`, `cpa-gui.yaml`, `oauth`, `usage-records`, `cpa-core`, `agents`, and `backups`. They do not include external client configurations, external TLS certificates or other separately referenced files, browser preferences, or the separately cached agent model-catalog overrides in the webview application-data directory. The usage pricing table is included. Windows inherits the destination parent's permissions; choose a private parent. Unix backup/migration destination folders are owner-only.

If a disk is disconnected, reconnect it at the saved path. If the app cannot start because its selected data was damaged, retain `storage.json` and the old folder for diagnosis. With the app closed, a verified backup's contents can be copied into a fresh portable installation (without overwriting the damaged files); move the locator aside so the new installation can register that recovered copy. Use the same or a newer application version. Do not hand-merge SQLite files or copy a live database without its WAL.

This protects data through the normal upgrade and migration paths. Separate backups are still needed for disk loss, accidental deletion, or corruption. Usage that was never recorded, or was already removed by a size limit, cannot be recovered by moving folders.

## Regression checks

- `cargo test --manifest-path src-tauri/Cargo.toml --bin cpa-gui storage::tests -- --test-threads=1`
- The updater's `portable_update_replacement_preserves_user_data_and_can_roll_back` test covers profile markers, portable data, SQLite files, and rollback preservation.
- `node tests/data-storage-ui.cjs` checks location selection, scheduling/cancel/restart, navigation persistence, retention confirmations, backup/restore controls, responsive layouts, and error handling with mock data.

See [the upstream merge guide](upstream-merges.md) before merging changes to runtime paths or startup/update behavior.
