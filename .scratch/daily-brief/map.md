# Map: Daily Brief

Labels: wayfinder:map

## Destination

A **v1 spec** for a daily brief, ready to hand to a build session: which sources it ingests, how items are tiered, how hot trends are detected, and how and where the digest is delivered. Building it is out of scope.

## Notes

- Planning only: tickets produce decisions, not code.
- Tracker: local markdown (see `docs/agents/issue-tracker.md`).
- v1 sources: podcasts, YouTube, newsletters. Prefer existing transcripts/captions/text over audio transcription.
- Tiering: LLM judges items against a user-written interest profile (must-see / worth-a-skim / skip).
- Hot trend: same topic or linked URL in 2+ distinct sources within a window.
- Delivery: one digest per morning.
- No Gmail access: the user will not grant access to personal Gmail. Newsletters must come from RSS feeds, public web archives, or a dedicated inbox.

## Decisions so far

<!-- one line per resolved ticket: - [Title](issues/NN-slug.md): gist -->

## Not yet specified

- Feedback loop: thumbs up/down tuning the interest profile.
- Other sources (RSS blogs, Reddit, HN, X, LinkedIn).
- State and dedupe: remembering what was already briefed.
- "Dig deeper" affordance on a hot trend (follow-up research on demand).
- Cost budget and quality evaluation of the tiering.

## Out of scope

- Building the system (belongs to a separate build effort after the spec).
