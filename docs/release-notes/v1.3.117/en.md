## Versioning

- Custom releases now follow the upstream desktop version. **1.3.117** is based on upstream **0.3.117**. The leading 1 marks this distribution, and fork-only fixes between upstream releases are numbered 1.3.117+1, 1.3.117+2, and so on (Windows shows these as 1.3.117.1, 1.3.117.2).
- Existing 0.4.x installations see 1.3.117 as a normal update.

## Updated

- Integrates EasyCLIProxyAPI v0.3.117 and its bundled CLIProxyAPI core 8.0.78. This includes the never-published 0.4.4 integration of v0.3.99.
- Adds ACP access for Antigravity on the OAuth page, with saved accounts, an explicit API start/stop switch, tool calls, and streaming.
- Adds optional background automatic updates in Version Management. Desktop updates still come only from this repository, and core updates come from the official CLIProxyAPI releases.
- Adds per-agent system prompt editing, sensitive word replacement rules, custom theme import, a redesigned Live Routing view, and a searchable model price editor.
- Includes plugin update notifications, plugin store improvements, quota refinements, reverse-proxy recovery, and many usage, ZCode, Codex, and Claude Desktop fixes.

## Retained

- Subscription Usage, Subscription Value with saved fees, storage and backups, account priority and session-affinity controls, and the Windows Setup installer all carry forward unchanged.

## Changed

- Sensitive word cloud rules are downloaded from this repository instead of upstream.
- ZCode manual models with no reasoning levels selected now get a low/medium/high list when written to ZCode, because ZCode rejects an empty list and drops the whole provider configuration. The editor still shows your empty selection.

## Compatibility

- Custom skills are discovered in the application's `skills` folder. Existing skills under `$HOME/.easy-cli-proxy-api/skills` may need to be copied there.
