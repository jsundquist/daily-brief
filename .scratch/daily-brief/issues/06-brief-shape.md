# Design the brief's shape and delivery

Type: grilling
Status: resolved
Blocked by:

## Question

v1 has no tiering. Design the digest as a scrollable list of every item from all sources that the user can check off: layout and grouping (by source, day or type), a hot-trends section at the top, per-item display (title, source, link, the source's own description, no LLM summary), the check-off and what it implies for state, and where the user reads it (HTML page, email, other).

## Added context

From the source inventory: the user does not want to commit to a volume yet. Decide whether the brief is capped to a subset or is a full scrollable list the user can check items off in. Checking off implies state (what was seen), which touches the fog item on state and dedupe.

## Answers so far (grilling in progress)

- Surface: an HTML page or a macOS widget, always on screen, refreshing on a cadence.
- Grouping: by source, then by day.
- Check-off: strikethrough on the item text, meaning "looked at it" or "decided to skip".

## Answer

v1 is a single local **HTML page**, always open on screen, fed by data kept separate from the display so a macOS widget or menu-bar wrapper can reuse it later.

- **Refresh:** hourly. New items append under today's date.
- **Grouping (amended: hot-trends section removed from v1):** sources grouped by type (podcasts, YouTube, newsletters, news sites), then by source, then by day, newest day first.
- **Item:** title, source, link, and the source's own description. No LLM summary.
- **Window:** the last 3 days per source; older items drop off. Aggregators such as Hacker News are capped at the top 10; all other sources show every item.
- **Check-off:** one strikethrough state meaning "looked at it" or "decided to skip"; clicking again undoes it. State is keyed by item link so a re-fetched item stays struck through. Where that state is stored (local file vs browser storage) is left to the runtime ticket.

**Amendment:** the hot-trends section no longer exists in v1; see the closed hot-trend ticket.
