# 02: All sources, grouped by type, source and day

**What to build:** All verified feeds in the user's inventory (podcasts, newsletters, news sites, the CNCF YouTube channel, and TLDR's seven editions) are loaded from one config list and appear on the page, grouped by type (podcasts, YouTube, newsletters, news sites), then by source, then by day, newest day first. Each item shows title, source, link and the source's own description.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] Adding or removing a source means editing only the config list
- [x] Both RSS and Atom feeds (including the YouTube channel feed) are parsed
- [x] Items older than 3 days are not shown
- [x] Hacker News shows only its top 10; other sources show every item
- [x] Dropped sources (no feed) are absent, and nothing is invented for them
- [x] Page grouping and ordering match the stated type, source, day, newest-first layout
