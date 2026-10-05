# EasyCLIProxyAPI Custom 0.4.0

- Merge upstream desktop 0.3.22 and bundle official CLIProxyAPI core 8.0.15.
- Preserve provider quota summaries, filters, searchable account ledger, account priority editing, and session-affinity controls.
- Include upstream Claude quota reset support and management API/configuration fixes.
- Move desktop updates and model catalog to appliedi/EasyCLIProxyAPI-Custom. Core updates still use the official CLIProxyAPI releases.
- Publish Windows x64 and ARM64 portable packages with verified update manifests.

For the first upgrade from our custom 0.3.6 build, stop the core, close the application, back up the portable folder and extract this package over it. Preserve config.toml, oauth/, and cpa-core/config.yaml. Start the app and use Install Bundled Core to install 8.0.15. Subsequent desktop updates use this repository. Session affinity is per session/model and does not guarantee upstream cache retention.
