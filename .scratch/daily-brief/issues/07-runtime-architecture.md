# Choose runtime and architecture

Type: grilling
Status: resolved
Blocked by:

## Question

Where and when does it run (local Mac schedule vs cloud routine), how are credentials handled unattended, what is the pipeline outline, and what is the acceptable daily cost?

## Added context (from the brief-shape decision)

Output is a single HTML page, refreshed hourly, with a data layer separate from the display. Open for this ticket: how the page is served or opened (static file vs tiny local server), where check-off state is stored (local file vs browser storage, keyed by item link), and how an hourly job runs unattended.

## Added context (scope cut)

v1 is a plain aggregator: fetch feeds hourly, store items, render the grouped HTML page with strikethrough check-off. No trend detection, no tiering, no transcripts, no LLM. Include the daily running cost (expected near zero) and how the 20-odd feed URLs in `sources.md` are configured.

## Answer

**Option B: a tiny local server.** One small process on the user's Mac, kept alive by `launchd`, serves the HTML page and fetches the feeds itself every hour. Items and check-off state (keyed by item link) are stored in a local file or SQLite, so state survives reloads and browser changes. The data layer is separate from the display so a widget can reuse it later. Cost is near zero: no LLM, public feeds only. The feed list is a config file seeded from `sources.md`.

Rejected: a static page with browser storage (fragile state, nothing a widget could read) and a cloud-hosted setup (most moving parts, not "on my Mac screen").

Left open for the build: language and storage engine (file vs SQLite), and sleep behaviour. Default assumption for sleep: if the Mac is asleep at the hour mark, the job catches up on wake.
