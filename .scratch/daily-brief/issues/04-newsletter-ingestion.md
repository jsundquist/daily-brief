# Research newsletter ingestion without Gmail

Type: research
Status: open
Blocked by:

## Question

The user will not grant access to their personal Gmail. What are the ways to ingest newsletters without it: public web archives of the newsletter (scraping), RSS/Atom feeds (Substack, Beehiiv, Ghost, etc.), a dedicated inbox or forwarding address, or services like Kill-the-Newsletter? Which newsletter platforms expose feeds or archives, what are the scraping constraints (robots.txt, paywalls, rate limits), and what is reliable enough for an unattended daily run?

## Research

Findings: [research/04-newsletter-ingestion.md](../research/04-newsletter-ingestion.md). Gist: prefer publisher RSS/Atom feeds, use a dedicated inbound address for paid or feed-less newsletters, treat Kill-the-Newsletter as a fallback, and do not scrape HTML archives (Substack and beehiiv ToS prohibit it).
