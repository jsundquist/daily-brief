# Research newsletter ingestion without Gmail

Type: research
Status: resolved
Blocked by:

## Question

The user will not grant access to their personal Gmail. What are the ways to ingest newsletters without it: public web archives of the newsletter (scraping), RSS/Atom feeds (Substack, Beehiiv, Ghost, etc.), a dedicated inbox or forwarding address, or services like Kill-the-Newsletter? Which newsletter platforms expose feeds or archives, what are the scraping constraints (robots.txt, paywalls, rate limits), and what is reliable enough for an unattended daily run?

## Answer

v1 ingests from **RSS/Atom feeds only**, for podcasts, newsletters, news sites and the YouTube channel. No scraping of archives and no dedicated inbox. Verified feed URLs are in `../sources.md`.

- TLDR uses its per-edition feeds (`tldr.tech/api/rss/<edition>`); the archive pages are not used.
- Sources with no feed are dropped from v1: Python Weekly, DevOps Weekly, KubeWeekly, The Batch, Test & Code (whose domain also now redirects somewhere unrelated).
- The user's newsletters are all free, so paywalled feed content is not a concern.
- Gmail is not used.

## Research

Findings: [research/04-newsletter-ingestion.md](../research/04-newsletter-ingestion.md). Gist: prefer publisher RSS/Atom feeds, use a dedicated inbound address for paid or feed-less newsletters, treat Kill-the-Newsletter as a fallback, and do not scrape HTML archives (Substack and beehiiv ToS prohibit it).
