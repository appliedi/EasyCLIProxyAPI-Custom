# EasyCLIProxyAPI Custom

See the [changelog](CHANGELOG.md), [upstream merge guide](docs/upstream-merges.md), and [contribution requirements](CONTRIBUTING.md) before making changes or merging upstream.

This is the independently maintained [appliedi/EasyCLIProxyAPI-Custom](https://github.com/appliedi/EasyCLIProxyAPI-Custom) distribution, based on [router-for-me/EasyCLIProxyAPI](https://github.com/router-for-me/EasyCLIProxyAPI). The upstream MIT license and attribution are preserved.

Version **1.3.117** incorporates upstream desktop **0.3.117** and bundles CLIProxyAPI **8.0.78**, with a dedicated **Subscription Usage** sidebar item for our provider quota summaries, account ledger, priority editor, and session-affinity controls. Upstream **Quota Lookup** remains a separate page. Desktop updates and the model catalog come from this repository. Core updates continue to come from the official CLIProxyAPI repository.

Custom versions follow the upstream desktop release they are built on: `1.<upstream minor>.<upstream patch>`, so 1.3.117 is based on upstream 0.3.117. Fork-only fixes between upstream releases add numeric build metadata (`1.3.117+1`, `1.3.117+2`), which Windows shows as 1.3.117.1 and 1.3.117.2. See [versioning](docs/upstream-merges.md#versioning).

Download Windows builds from [our releases](https://github.com/appliedi/EasyCLIProxyAPI-Custom/releases/latest). The first migration from the old custom 0.3.6 build must be manual because that build still checks the upstream desktop update feed. Close the old app and stop its core, back up the portable folder, then extract the new package over it, preserving `config.toml`, `oauth/`, and `cpa-core/config.yaml`.

Version **0.4.3** also adds a standard Windows **Setup.exe** alongside the portable ZIP. It installs for your Windows account, offers reuse of an existing portable data folder, and keeps usage, fees, settings, and credentials when uninstalled. Build it with `.\build-installer.ps1`; see the [Windows installer guide](docs/windows-installer.md), [storage guide](docs/data-storage.md), and [validation report](docs/upstream-0.3.117-validation.md).
