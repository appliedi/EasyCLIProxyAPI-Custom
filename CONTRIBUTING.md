# Contributing to EasyCLIProxyAPI Custom

This distribution is maintained separately from `router-for-me/EasyCLIProxyAPI` while retaining upstream history and licensing.

- Include an entry in [CHANGELOG.md](CHANGELOG.md) under **Unreleased** with every functional or maintenance change. Explain the user-visible result, compatibility implications, and relevant validation. Group related changes rather than listing every edited line.
- For upstream merges, follow [the merge guide](docs/upstream-merges.md). Record the exact upstream commit, core version, conflict decisions, and custom behavior retained or replaced.
- Keep desktop update ownership in this repository. Do not restore upstream desktop release URLs or mirrors while resolving conflicts.
- Preserve active installations and user configuration during development. Use mock accounts and isolated cores for tests.
- Treat release tags as immutable. Update the changelog and localized release notes before tagging a new version; record later work under Unreleased.
