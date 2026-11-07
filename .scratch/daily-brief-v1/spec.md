# Daily Brief v1: a plain feed aggregator page

**Status:** ready-for-agent

Planning history: `.scratch/daily-brief/map.md` (decisions and rationale), `.scratch/daily-brief/sources.md` (the source inventory and verified feed URLs). Build tickets: `.scratch/daily-brief-v1/issues/`.

## Problem Statement

I follow a lot of podcasts, newsletters, a YouTube channel and a couple of news sites. Checking each one by hand is tedious, and I miss things. I want one place, always visible on my Mac, that shows what each source published recently, so I can scan it and mark what I have looked at.

## Solution

A small local server on my Mac serves one HTML page. Every hour it fetches a configured list of RSS/Atom feeds, stores the items, and the page shows them grouped by type (podcasts, YouTube, newsletters, news sites), then source, then day, newest day first, over the last 3 days. I click an item to strike it through (looked at it or skipped it), and click again to undo. v1 has no filtering, no tiering, no trend detection, no transcripts and no LLM: it is a plain aggregator I can use, so we can see what we have and build on it.

## User Stories

1. As a reader, I want one page listing recent items from all my sources, so that I do not have to visit each one.
2. As a reader, I want items grouped by type (podcasts, YouTube, newsletters, news sites), so that I can scan the kind of content I am in the mood for.
3. As a reader, I want sources listed within each type and items grouped by day within each source, so that I can see what is new per source.
4. As a reader, I want the newest day first, so that today's items are at the top of each source.
5. As a reader, I want each item to show its title, source, link and the source's own description, so that I can decide whether to open it.
6. As a reader, I want clicking an item's link to open the original item, so that I can read, watch or listen to it.
7. As a reader, I want only the last 3 days shown, so that the page stays short.
8. As a reader, I want Hacker News capped at its top 10 items, so that it does not drown out everything else.
9. As a reader, I want every item shown for all other sources, so that nothing from a low-volume source is hidden.
10. As a reader, I want to click an item to strike it through, so that I can see what I have already looked at or decided to skip.
11. As a reader, I want to click a struck-through item again to undo it, so that I can fix a mis-click.
12. As a reader, I want strikethrough state to survive a page reload, so that I do not lose my place.
13. As a reader, I want strikethrough state to survive a server restart, so that a reboot does not reset my day.
14. As a reader, I want strikethrough state to survive an item being re-fetched, so that hourly refreshes never un-check my items.
15. As a reader, I want the page to pick up new items each hour without me reloading it, so that it can stay open on my screen.
16. As a reader, I want new items to appear under today's date, so that I can tell what is new.
17. As a reader, I want a broken feed to not break the page, so that one flaky source does not hide the others.
18. As a reader, I want to see when each source last updated successfully, so that I can tell if data is stale.
19. As a reader, I want a visible warning on a source that keeps failing, so that a silent break gets noticed.
20. As a reader, I want a failing source to keep showing its last good items, so that the page does not go blank.
21. As the owner, I want the list of feeds in one config file, so that adding or removing a source is a one-line edit.
22. As the owner, I want the config seeded with my verified feeds (Syntax, The Changelog, Go Time, Practical AI, Ship It, Latent Space, Kubernetes Podcast, the CNCF YouTube channel, TLDR's seven editions, Node Weekly, JavaScript Weekly, Console.dev, The Pragmatic Engineer, Hacker News, InfoQ), so that it works on first run.
23. As the owner, I want both RSS and Atom feeds supported, so that the YouTube channel feed works like the others.
24. As the owner, I want the server to start at login and restart if it stops, so that the page is always available.
25. As the owner, I want a refresh missed while my Mac slept to be caught up when it wakes, so that I do not miss items.
26. As the owner, I want the data layer separate from the page, so that a macOS widget could reuse it later.
27. As the owner, I want it to cost essentially nothing to run, so that I can leave it on indefinitely.
28. As the owner, I want sources without a feed left out of v1, so that nothing is scraped or guessed.

## Implementation Decisions

- **Shape:** one small local server process on the owner's Mac. It serves the HTML page, fetches the configured feeds itself every hour, and holds the stored data. Run and kept alive by macOS `launchd`.
- **Modules (deep, small interfaces):**
  - *Feed fetcher/parser:* given a feed URL, returns normalised items (title, link, description, published time, source). Handles RSS and Atom; handles timeouts and invalid XML by reporting failure rather than throwing into the rest of the app.
  - *Store:* persists items, per-source freshness/failure info, and check-off state. Items are keyed by link; check-off state is keyed by item link. Exact engine (JSON file or SQLite) is a build decision.
  - *Page renderer:* given stored data and the current time, produces the grouped page: type, then source, then day, newest first, 3-day window, Hacker News capped at 10.
  - *Scheduler/refresh loop:* fetches all feeds on the hour, catches up if a refresh was missed, takes the clock as an injected dependency.
  - *HTTP layer:* serves the page and accepts the check-off toggle.
- **Config:** one file listing sources, each with a name, type (podcast, YouTube, newsletter, news site), feed URL, and an optional item cap (Hacker News: 10). Seeded from the verified feeds in `.scratch/daily-brief/sources.md`. Sources with no feed (Python Weekly, DevOps Weekly, KubeWeekly, The Batch, Test & Code) are excluded.
- **Item display:** title, source name, link, and the feed's own description. No LLM, no summaries, no transcripts.
- **Page behaviour:** the open page updates when new data arrives, with no manual reload. Strikethrough is toggled by clicking an item and is stored on the server.
- **Check-off:** a single state meaning looked at or skipped. State for items that have aged out of the 3-day window may be discarded.
- **Failure handling:** a failing feed never affects other sources. Each source records its last successful update; repeated failures show a visible warning; last good items stay visible.
- **Stack:** not yet chosen. Ticket 01 selects it and records the choice in `AGENTS.md` under a "Stack" heading so later tickets follow it. Suggested default: TypeScript on Node, since the owner works in JS/TS. Owner's JS/TS style rules apply: no single-line `if` statements (always braces), and `return` statements on their own line.
- **Cost:** near zero. Public feeds only, no paid APIs.
- **No Gmail, no scraping:** ingestion is feeds only.

## Testing Decisions

- **One seam:** the local server's HTTP boundary. Tests start the real server in-process, pointed at a config whose feed URLs are local fixture feeds, and drive it only over HTTP. Tests assert on external behaviour (what the page shows, what persists), not on internal modules.
- **Injected clock:** the only fake. It lets tests move time to check the 3-day window, the hourly refresh trigger, and catch-up after a missed refresh.
- **What the tests cover:**
  - Reading: grouping by type, source and day; newest-first; 3-day cutoff; Hacker News cap of 10; description shown; Atom/YouTube parsed like RSS.
  - Check-off: toggle on and off; persists across reload, server restart, and re-fetch of the same link.
  - Refresh: hourly trigger, new items appear, check-offs preserved.
  - Failure: a timeout fixture and an invalid-XML fixture leave other sources intact, show last-updated time, warn on repeated failure, and keep last good items.
- **Not automated:** `launchd` keeping the server alive and starting it at login is verified by hand as part of the hourly-refresh ticket.
- **Prior art:** none; this repo has no code yet. Ticket 01 establishes the test setup the others reuse.
- **A good test** here fetches a page or posts a toggle and asserts on the response, so it keeps passing when internals are refactored.

## Out of Scope

- Tiering, an interest profile, LLM judging, a feedback loop, or any filtering.
- Hot-trend detection and the "dig deeper" follow-up.
- Transcripts or captions of any kind (the Changelog family and Latent Space expose transcript links in their feeds; Syntax has transcript pages on its site; revisit after v1).
- A macOS widget or menu-bar wrapper (the separate data layer keeps this possible).
- Sources beyond the current inventory (other RSS blogs, Reddit, X, LinkedIn).
- Sources without a feed, and any scraping, dedicated-inbox or Gmail route.
- Cloud hosting.

## Further Notes

- Feed facts that may matter later: Node Weekly and JavaScript Weekly publish one item per issue (large body, many links); TLDR descriptions looked empty and its item links were not checked; Console.dev has three candidate feeds and the main one is used; the Test & Code domain now redirects somewhere unrelated.
- Researched findings on transcripts and newsletter ingestion are on local branches `research/transcript-availability` and `research/newsletter-ingestion` (never pushed or merged).
