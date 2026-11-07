# 01: Single-feed tracer: fetch, store, render

**What to build:** A tiny local server is running on the user's Mac and serves one HTML page. On start, it fetches one real feed (Hacker News), stores the items locally, and the page lists them with title, link and description. This proves the whole path from feed to storage to page, with the storage and server shape the rest will build on.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Starting the server and opening the page in a browser shows Hacker News items with title, link and description
- [ ] Items are stored locally, so restarting the server keeps them
- [ ] The data layer is separate from the page rendering (the page reads stored items through the server)
- [ ] A test covers parsing a feed into stored items
