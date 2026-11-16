# Scheduled executive brief from a local model

Type: task
Status: claimed
Blocked by:

## What

A standalone job runs at 09:00 every day, refreshes the feeds, asks a local model (Ollama, OpenAI-compatible API so LM Studio also works) for an executive brief, and stores it in SQLite. A skill reads it back through an MCP server over the database. The dashboard server is not required.

## Decisions

- The dashboard server is not always running, so the schedule lives in its own launchd job (`StartCalendarInterval` 09:00; launchd runs a missed job on wake), not inside the server.
- Storage is `data/briefs.db` via built-in `node:sqlite`, one row per day. `store.json` stays as it is.
- The model only returns item ids. Titles and links are rebuilt from the data, so a hallucinated id is dropped and a link can never be invented.
- Two passes: batches are triaged against `skills/daily-brief/profile.md` (care / maybe / skip, topic, one-line reason), then one reduce call writes the executive summary and groups stories covered by 3+ sources.
- Shape: executive summary, "Should care about" by topic, "Maybe of interest" (the model's borderline picks), "Across your sources".
- Items that appear in a brief are recorded as briefed and do not resurface in the next brief. This is separate from the user's strike-through.
- If the model is unreachable the job logs and exits non-zero without writing a brief.
- Agentic scope for now: generate and notify, plus the briefed marker. Full-article fetching and learning from strike-throughs are later.

## Acceptance

- [ ] Feed refresh is a shared module used by both the server and the job
- [ ] OpenAI-compatible client with configurable base URL and model
- [ ] Brief generation drops unknown ids and never emits a title or link that is not in the data
- [ ] Briefs stored per day in SQLite; re-running the same day replaces that day's brief
- [ ] Briefed items are excluded from the next brief
- [ ] `npm run brief` runs the job on demand; launchd plist runs it at 09:00
- [ ] MCP server exposes `get_brief(date?)` and `list_briefs`
- [ ] The daily-brief skill reads the latest stored brief
- [ ] Dashboard shows the latest brief as a panel when the server is running
