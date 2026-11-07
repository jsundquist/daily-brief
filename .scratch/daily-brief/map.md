# Map: Daily Brief

Labels: wayfinder:map

## Destination

A **v1 spec** for a daily brief, ready to hand to a build session: which sources it ingests, how they are stored and refreshed, and how the page is delivered. v1 is a plain aggregator: it lists everything from the feeds with no tiering and no trend detection. Building it is out of scope.

## Notes

- Planning only: tickets produce decisions, not code.
- Tracker: local markdown (see `docs/agents/issue-tracker.md`).
- v1 sources: podcasts, YouTube, newsletters.
- No tiering or LLM judging in v1: the brief lists everything, scrollable and checkable. Filtering comes later, from real use.
- Item text: titles, source descriptions and links only; no transcripts in v1.
- Delivery: a local HTML page served by a tiny local server, always open, refreshed hourly (see Decisions so far).
- All of the user's newsletters are free (no paywalls to handle).
- No Gmail access: the user will not grant access to personal Gmail. Ingestion is RSS/Atom feeds only.

## Decisions so far

<!-- one line per resolved ticket: - [Title](issues/NN-slug.md): gist -->

- [Inventory your sources](issues/02-source-inventory.md): 8 podcasts, 10 newsletters, 2 news sites, CNCF on YouTube; all newsletters free; details in `sources.md`.
- [Design the brief's shape and delivery](issues/06-brief-shape.md): hourly-refreshed HTML page, grouped by type then source then day (3 days), strikethrough check-off keyed by link.
- [Research newsletter ingestion without Gmail](issues/04-newsletter-ingestion.md): v1 uses feeds only (TLDR per-edition feeds, no archives); five feedless sources dropped.
- [Choose runtime and architecture](issues/07-runtime-architecture.md): a tiny local server under `launchd` serves the page, fetches hourly, and stores items and check-off state locally; near-zero cost.

## Not yet specified


## Out of scope

- [Define the interest profile and tier criteria](issues/01-interest-profile.md): v1 does no tiering; deferred until after real use.
- [Research transcript and caption availability](issues/03-transcript-availability.md): v1 needs no transcripts; findings kept on `research/transcript-availability`.
- Post-v1 filtering: LLM tiering against an interest profile, a thumbs up/down feedback loop, transcripts, and judging-quality evaluation. Returns as a fresh effort after real use of v1.
- macOS widget or menu-bar wrapper: v1 is the HTML page; the data layer is kept separate so a widget can reuse it later.
- [Define hot-trend detection](issues/05-trend-detection.md): v1 is a plain aggregator; trends, and the "dig deeper" follow-up that depends on them, wait until v1 has been used.
- Other sources beyond the current inventory (RSS blogs, Reddit, X, LinkedIn).
- Feedless sources (Python Weekly, DevOps Weekly, KubeWeekly, The Batch, Test & Code) and any dedicated-inbox or scraping route: dropped from v1 by the user.
- Building the system (belongs to a separate build effort after the spec).
