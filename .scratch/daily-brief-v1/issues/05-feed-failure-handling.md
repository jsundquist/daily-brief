# 05: Feed failure handling and freshness

**What to build:** A feed that errors, times out or returns junk does not break the page or other sources. Each source shows when it last updated successfully, and a source that has been failing is visibly flagged, so a silent break is noticed.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] One failing feed leaves all other sources displaying normally
- [ ] Each source shows a last-updated time
- [ ] A source failing across refreshes shows a visible warning
- [ ] The last good items for a failing source are still shown
- [ ] A test covers a timeout and an invalid-XML feed
