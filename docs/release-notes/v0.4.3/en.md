# Custom 0.4.3

- Integrated upstream desktop **0.3.76** and bundled official CLIProxyAPI **8.0.52**, including agent discovery performance fixes, improved quota handling, Agent usage history, routing, MCP/skills management, themes, and reverse proxy support.
- Preserved our separate **Subscription Usage** dashboard, account priority and session-affinity controls, and **Subscription Value** reporting with effective-dated monthly fees and pricing coverage.
- Added **Storage & backups** under Advanced Features. Data locations survive application upgrades; verified backup/restore retains usage, fees, credentials, agent history, MCP/skill settings, themes, and preferences. SQLite snapshots include committed WAL records.
- Added per-user Windows **Setup.exe** installers alongside portable ZIPs. Setup can reuse an existing portable data folder; reinstall/uninstall preserve personal data.
- Fixed inherited UI/localization, release tooling, and Windows test portability issues before publication.
- Desktop updates and catalogs remain on this Custom repository; proxy-core updates remain official.

## Updating

From Custom 0.4.0/0.4.1/0.4.2, use **Version Management → application update**. The in-app updater uses the portable ZIP and preserves existing settings, credentials, and usage history. For the first storage-aware upgrade, update the existing application folder so it can register your existing data. You can move it later through Storage & backups.

For a fresh installation, use the matching x64 or ARM64 Setup.exe. The old custom 0.3.6 build still uses the upstream desktop feed and requires a manual migration. Close the app and stop its core before manual replacement; back up the existing folder first. Windows installers are unsigned.
