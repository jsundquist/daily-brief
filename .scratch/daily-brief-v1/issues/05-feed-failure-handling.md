# 05: Feed failure handling and freshness

**What to build:** A feed that errors, times out or returns junk does not break the page or other sources. Each source shows when it last updated successfully, and a source that has been failing is visibly flagged, so a silent break is noticed.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] One failing feed leaves all other sources displaying normally
- [x] Each source shows a last-updated time
- [x] A source failing across refreshes shows a visible warning
- [x] The last good items for a failing source are still shown
- [x] A test covers a timeout and an invalid-XML feed

**Notes:** A source warns after 3 consecutive failed fetches (`WARN_AFTER_FAILURES` in `src/render.ts`); a single failure is normal. `POST /refresh` runs one fetch round of all sources (ticket 04 can schedule the same internal `refresh`). `fetchTimeoutMs` option sets the per-feed timeout (default 15s).
