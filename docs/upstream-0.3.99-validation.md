# Upstream v0.3.99 integration

Custom 0.4.4 incorporates upstream `023f656a99471b09bdfe3ec8af0b77bf62ccec72` from custom checkpoint `56334fcb`, preserving both parents. The pinned core is the desktop release's 8.0.63, not the independently newer core release.

## Merge decisions

- Retain custom release versions, Windows Setup, desktop update/catalog URLs, manifest validation, stable-tag reservation, and all-contributor PR validation including retargeting (`edited`). Keep automatic bundled-core drift disabled.
- Keep Subscription Usage and Subscription Value, effective-dated fees, persistent storage/profile locks, fail-closed startup and graceful restarts. Upstream core-continuity updates retain these protections.
- Adopt upstream MCP layout, routing confirmation, ZCode model-default behavior, new plugin store and notifications; use shared buttons, segmented controls, notices, empty states and CSS layers.
- Preserve explicit empty reasoning overrides. Upstream deliberately removes usage-history-based ZCode calibration; regression coverage now checks history-independent defaults and retained manual overrides.
- Restore provider/record isolation in usage-note fallback. Only legacy empty-record-hash rows in the same provider section can supply fallback notes.
- Add Russian custom-key coverage with translated labels and explicit English fallbacks for detailed custom strings.
- Keep our concise custom README and installer instructions instead of upstream download directions.
- Upstream now discovers custom skills in `<executable directory>/skills` instead of `$HOME/.easy-cli-proxy-api/skills`; existing custom skill folders may need to be copied there. External client files are outside storage backup scope.

## Validation

- `bun run check`: passed.
- `bun test`: 1,390 passed, 32 skipped, zero failed. The separately enabled real-core tests below cover the optional integration suite.
- Core 8.0.63 Windows amd64 archive verified against official checksums: `5d8c7a093580c25cace076344dd650c9318ecb9990d9e2147bcee0c515a24b2a`.
- Real-core API suite: 28 passed, zero failed; priority/affinity integration passed, including TTL renewal and idle expiry. Fake upstreams and an isolated core were used.
- Custom browser suites passed: quota dashboard/priority/affinity, subscription values/fee persistence, storage scheduling/cancellation/backup/restore. Light and narrow screenshots inspected.
- Architecture regression checks: 85 passed, including CSS syntax, shared controls, layers, tokens and surfaces.
- Initial Windows Rust run: 1,206 passed, four failed, 18 ignored. Three Claude Desktop assertions needed the new `behavesAs` metadata; the fourth exposed the usage-note isolation regression fixed above. Focused reruns: 10 app-settings and 105 agent-configuration tests passed (one ignored).
- An overlapping debug build initially hit Windows linker file locking while the first suite executable was running; subsequent Rust checks run serially.
- New migration regression uses the actual 0.4.3 usage table schema and checks retained accounts, requests, fees, priced coverage and equal estimated cost before/after migration (including long-context pricing).
- Independent read-only integration review found no blocker in storage, subscription data, core continuity, updater ownership, or installer packaging. Release workflow ownership was also checked separately.

## Pending final evidence

Final full Rust result, production Windows build, installer package and smoke-test results will be recorded here before completion. This branch has not been published or installed over the active application.
