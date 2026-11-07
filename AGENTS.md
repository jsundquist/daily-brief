## Agent skills

### Issue tracker

Issues live as local markdown under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Stack

TypeScript on Node 24 or newer, run directly with Node's built-in type stripping (no build step, no tsx). Only erasable TypeScript syntax is allowed (no enums, no parameter properties); imports use the `.ts` extension. Runtime dependency: `fast-xml-parser`. Storage: a JSON file (default `data/store.json`, gitignored), written atomically.

- Install: `npm install`
- Run: `npm start` (serves on port 3000; override with `PORT` and `DATA_FILE`)
- Test: `npm test` (Node's built-in `node:test` runner); typecheck with `npm run typecheck`
- Layout: `src/feed.ts` (fetch and parse), `src/store.ts` (data layer), `src/render.ts` (pure HTML rendering), `src/server.ts` (HTTP and startup), `src/sources.ts` (the configured feeds), `src/window.ts` (which items a source shows and which the store keeps), `src/main.ts` (entry), `test/helpers.ts` (fixture feed server, temp store, `startReady`)
- Tests drive the real server over HTTP (`startServer({ sources, dataFile, port: 0 })`) against local fixture feeds in `test/fixtures/`, served by `serveFixture` in `test/helpers.ts`. Tests never touch the network.
- Style: JS/TS `if` statements always use braces; `return` goes on its own line.

## Hourly refresh and launchd

The server refreshes all feeds itself once an hour of clock time has passed (`REFRESH_INTERVAL_MS`, checked every `tickMs`). A gap after sleep is caught up on the first tick after wake. Capped sources are replaced, not accumulated, on each refresh. The open page polls `/version` and swaps its content when it changes (check-off state is server-side).

Run at login and restart on exit with the LaunchAgent template `deploy/com.dailybrief.server.plist` (`RunAtLoad`, `KeepAlive`). Manual verification pending; nothing here is loaded automatically.

- Install: `mkdir -p data ~/Library/LaunchAgents && sed -e "s|__NODE__|$(command -v node)|" -e "s|__PROJECT_DIR__|$PWD|g" deploy/com.dailybrief.server.plist > ~/Library/LaunchAgents/com.dailybrief.server.plist && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.dailybrief.server.plist`
- Uninstall: `launchctl bootout gui/$(id -u)/com.dailybrief.server && rm ~/Library/LaunchAgents/com.dailybrief.server.plist`
- Logs: `data/server.log`
