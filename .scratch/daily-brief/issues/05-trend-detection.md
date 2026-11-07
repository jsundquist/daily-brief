# Define hot-trend detection

Type: grilling
Status: closed (out of scope for v1)
Blocked by:

## Question

Define a deterministic hot-trend rule with no LLM: the same normalised link, or obvious topic/keyword overlap, in 2+ distinct sources within a time window. Decide link normalisation, the keyword/topic matching method, the window and threshold, and how a trend is shown (grouped at the top with its source items).

## Added context (from the brief-shape decision)

Trends are recomputed on every hourly refresh over the last 3 days of items and shown in a section pinned at the top of the page. Hacker News is capped at its top 10, so only those count as HN items.

Feed facts that affect this (see `../sources.md`): Node Weekly and JavaScript Weekly publish one feed item per issue, about 6-8k characters with many links inside, so link-based trends must extract links from item bodies. TLDR feed items showed empty descriptions by measure and need a check on what the item link points at.

## Resolution

Ruled out of scope for v1: the user wants to bring the idea back to a plain aggregator first, see what it looks like, then build on it. Feed facts gathered for this (issue-level newsletter items with links in the body; TLDR items to check) are kept above for when trends return.
