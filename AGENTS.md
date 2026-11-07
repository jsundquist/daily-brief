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
- Layout: `src/feed.ts` (fetch and parse), `src/store.ts` (data layer), `src/render.ts` (pure HTML rendering), `src/server.ts` (HTTP and startup), `src/main.ts` (entry and config)
- Tests drive the real server over HTTP (`startServer({ sources, dataFile, port: 0 })`) against local fixture feeds in `test/fixtures/`, served by `serveFixture` in `test/helpers.ts`. Tests never touch the network.
- Style: JS/TS `if` statements always use braces; `return` goes on its own line.
