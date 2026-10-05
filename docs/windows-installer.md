# Windows Setup.exe

Custom builds starting with 0.4.2 can be distributed in two formats:

- `EasyCLIProxyAPI-v<version>-Windows-<arch>-setup.exe`: the standard installer.
- `EasyCLIProxyAPI-v<version>-Windows-<arch>.zip`: the existing portable package and in-app update payload.

The installer uses [Tauri's NSIS packaging](https://v2.tauri.app/distribute/windows-installer/). It installs for the current Windows user, defaults to `%LOCALAPPDATA%\EasyCLIProxyAPI Custom`, creates a Start Menu shortcut, offers a desktop shortcut, and registers an entry in Windows Installed Apps. It downloads the Microsoft WebView2 runtime if needed. The proxy core archive is bundled with the application.

## Keep existing data

Exit the portable app from its tray menu before running Setup. Setup refuses to force-kill a running app, including in silent mode.

If a storage-aware Custom build has already registered a data folder, the installed app reuses it. Otherwise Setup asks whether you have a portable installation. Choose **Yes**, then select its existing folder (the one containing `config.toml`). Selecting a newer portable installation's parent folder also recognizes its `data` subfolder. For example, select `C:\Users\<you>\Apps\EasyCLIProxyAPI` if that is your permanent portable folder.

The installed app registers that folder on first launch; it does not copy or erase it during installation. Keep the old folder. You can subsequently move its data using **Advanced Features → Storage & backups**. A missing or invalid selected folder stops startup instead of silently creating a replacement profile.

Choose **No** for a fresh install. Its usage, fees, pricing, credentials, and settings default to `%LOCALAPPDATA%\EasyCLIProxyAPI-Custom\data`, outside the installed program directory. The location is remembered in the adjacent `storage.json`.

## Updates and uninstall

The installed executable is named `EasyCLIProxyAPI.exe` and includes the same `portable-app.json` and core assets expected by the existing updater. In-app updates continue to download the ZIP package. The installation marker and saved data location remain in place. Running a newer Setup.exe is also supported. Windows Installed Apps reports the version last installed with Setup; the application's Version Management page reports the running version after an in-app update.

Uninstall removes the shipped application files, shortcuts, and uninstall registration. It does not remove the saved storage locator, usage database, credentials, backups, selected portable folder, or other non-packaged files. Tauri's optional **Delete app data** checkbox concerns webview preferences under `com.cpa.gui`, not the separately stored usage and credentials. Leave it unchecked to retain those preferences too.

The installer is currently unsigned. Windows may display an unknown-publisher or reputation prompt. Release packages include a `.sha256` file for integrity checking; a checksum is not a publisher signature.

## Build locally

```powershell
.\build-installer.ps1
```

This compiles the app, prepares a clean payload with a verified core archive, and builds NSIS Setup.exe. Output is under `.codex\builds`. It does not install or launch the resulting application. Use `-SkipBuild` only when the release executable is already current. Tauri obtains the NSIS build tools automatically.

`scripts/prepare-installer.mjs` validates the payload's version, architecture, and core checksum. It passes an explicit resource allowlist to the bundler; it never packages a working data folder by wildcard. Keep `installation.json` exclusive to the installer, so portable ZIPs retain their existing behavior.

The release workflow builds x64 and ARM64 Setup.exe assets alongside their portable ZIPs, runs installation/reinstallation/uninstallation checks with fictional data on each Windows runner, and uploads the installers and checksums to the same release. The in-app update manifest continues to reference ZIPs.

## Silent installation and validation

Fresh silent installation uses `/S`. To select existing portable data before its first registered startup, supply `/PORTABLEDATA="C:\path\to\portable"`. `/D=C:\desired\install\folder` is optional and must be the final parameter, following NSIS conventions. A running app makes installation/uninstallation fail rather than terminating the app. The application is not launched by a silent install unless `/R` is explicitly supplied.

`tests/windows-installer-smoke.ps1` exercises installation, reinstallation, import-path encoding, shortcuts, uninstall registration, and preservation of files inside and outside the install directory. Run it only in an isolated environment or with a separately named test bundle: it refuses to replace an already registered product or operate against a running app. Fixtures are retained under `.codex` for inspection.

For data migration and backup scope, see [Storage and upgrade persistence](data-storage.md).
