# 03: Check off items with strikethrough

**What to build:** Clicking an item on the page strikes it through, and clicking again undoes it. The state is stored by the server, keyed by item link, so it survives a reload, a server restart, and the item being fetched again.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Clicking an item toggles a strikethrough on its text
- [ ] The state persists across page reload and server restart
- [ ] A re-fetched item with the same link keeps its state
- [ ] State for items that have aged out of the 3-day window may be discarded
- [ ] A test covers toggling and persistence keyed by link
