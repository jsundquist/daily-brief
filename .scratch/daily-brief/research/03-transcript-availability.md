# Transcript and caption availability

Ticket: [03-transcript-availability](../issues/03-transcript-availability.md)
Researched: 2026-11-07. Sources are first-party docs fetched that day. Anything not backed by a fetched primary source is marked **Unverified**.

## Summary

| Source | Text without audio transcription | Mechanism | Reliability |
|---|---|---|---|
| YouTube | Captions exist, but the official API only returns them to users who can edit the video | Official: `captions.list` / `captions.download` (owner only). Unofficial: scraping caption tracks | Official path is unusable for third-party videos. Unofficial path works but is against the Terms of Service |
| Podcasts | Publisher-supplied transcripts via `<podcast:transcript>` in the RSS feed; show notes in the feed | RSS item tag, formats VTT / SRT / JSON / HTML / plain text | Opt-in per show, so coverage is uneven. No source found that gives a coverage percentage |
| Newsletters | Full or partial body in the RSS item, or the post's public web page | RSS `description`; full content only when the publisher puts it there | Depends on the platform and publisher. Paywalled posts are not reliably available |
| Audio fallback | Any audio file | Speech-to-text API | About $0.003 to $0.006 per minute |

## YouTube

- The official Data API has `captions.list` and `captions.download`. Both need OAuth with `youtube.force-ssl` or `youtubepartner` scope ([captions.list](https://developers.google.com/youtube/v3/docs/captions/list), [captions.download](https://developers.google.com/youtube/v3/docs/captions/download)).
- `captions.download` "requires the user to have permission to edit the video" ([docs](https://developers.google.com/youtube/v3/docs/captions/download)). So it cannot fetch captions for videos by channels the user follows. This is the key constraint.
- Quota: `captions.list` costs 50 units. The `captions.download` page says 200 units, but the quota table does not list it ([quota cost](https://developers.google.com/youtube/v3/determine_quota_cost)). `playlistItems.list` and `videos.list` cost 1 unit each. The default budget is 10,000 units per day.
- Discovering new uploads is cheap and official: `playlistItems.list` at 1 unit lists a channel's uploads, and `videos.list` at 1 unit gives metadata (title, description). Per-channel RSS feeds exist but were **Unverified** (not fetched here).
- Unofficial caption extraction (third-party libraries that read the caption tracks the YouTube player uses) is **Unverified** against a primary source. The YouTube Terms of Service prohibit accessing the service "using any automated means (such as robots, botnets or scrapers)" except for search engines or with written permission ([YouTube Terms](https://www.youtube.com/t/terms)). Treat it as a risk to accept deliberately, not a supported mechanism.
- Auto-generated caption coverage is not documented in the sources I fetched.

## Podcasts

- The Podcast Namespace defines `<podcast:transcript>` inside an RSS `<item>`. Required attributes: `url`, `type`. Optional: `language`, and `rel="captions"` for timed captions. Multiple tags can offer the same transcript in several formats. MIME types listed: `text/plain`, `text/html`, `text/vtt`, `application/json`, `application/x-subrip` ([spec](https://podcasting2.org/docs/podcast-namespace/tags/transcript)).
- The tag is opt-in, so coverage depends on the show and its host. The spec page lists many supporting apps and hosts (44 apps and 37 hosting tools at fetch time) but gives no share of shows that publish transcripts.
- Apple Podcasts accepts VTT and SRT via the RSS tag, and also generates transcripts automatically for new episodes. Auto-generated transcripts can take 24 hours or more to appear, are skipped for episodes over 10 hours, and cover 11 languages ([Apple Podcasts for Creators](https://podcasters.apple.com/support/5316-transcripts-on-apple-podcasts)). I found no documented public API to fetch Apple's generated transcripts, so assume they are not available to the brief.
- Private feeds get no Apple auto-transcripts (same Apple page).
- Always available in the feed: episode title and description (show notes), per the [RSS 2.0 spec](https://www.rssboard.org/rss-specification), where `description` is a synopsis, though full content is allowed.

## Newsletters

The map rules out Gmail. Remaining text channels:

- **RSS feeds.** In RSS 2.0, an item's `description` holds a synopsis, and may carry full text as entity-encoded HTML when the item is complete in itself ([RSS 2.0](https://www.rssboard.org/rss-specification)). Whether a feed gives full or truncated content is a publisher choice. The spec page I fetched did not cover `content:encoded` (the common extension for full HTML).
- **Substack.** Publications have a feed at `<publication>.substack.com/feed` ([help center](https://support.substack.com/hc/en-us/articles/360038239391-Is-there-an-RSS-feed-for-my-publication)). I could not read that article (HTTP 403 on fetch), and I found no help article saying whether paywalled text posts appear in full in the feed. **Unverified**; test with a real paywalled post. Paid podcast episodes are excluded from the free feed, and paying subscribers get a private feed ([Substack help](https://support.substack.com/hc/en-us/articles/360041722272-Will-my-Podcast-RSS-feed-show-paid-only-content)).
- **Public web archive pages.** Fetch the post's URL. Paywalled content is not available this way.
- **Dedicated inbox** (the third option in the map): not researched here; belongs to ticket 04.

## Fallback: transcribing audio

Podcast audio is in the feed enclosure. For YouTube, getting audio means downloading video, which raises the same Terms of Service issue (the Terms clause quoted above; no further primary source checked).

Prices at fetch time:

| Service | Price | Source |
|---|---|---|
| OpenAI `gpt-4o-mini-transcribe` | about $0.003 / min | [OpenAI pricing](https://developers.openai.com/api/docs/pricing) |
| OpenAI `whisper-1`, `gpt-4o-transcribe` | about $0.006 / min | same |
| Deepgram Nova-3 monolingual, pay as you go | $0.0043 / min | [Deepgram pricing](https://deepgram.com/pricing) |
| AssemblyAI Universal-2 | $0.15 / hour (about $0.0025 / min) | [AssemblyAI pricing](https://assemblyai.com/pricing) |

Rough cost: a 60-minute episode costs about $0.15 to $0.36. Ten such episodes a day cost about $1.50 to $3.60 per day, or roughly $45 to $110 per month. This is an estimate computed from the listed rates.

OpenAI's API accepts files up to 25 MB (mp3, mp4, mpeg, mpga, m4a, wav, webm), so long episodes need compression or splitting ([guide](https://developers.openai.com/api/docs/guides/speech-to-text)). Self-hosted Whisper would cost compute only; not researched.

## Implications for the spec

- Podcasts: check for `<podcast:transcript>` first; fall back to show notes; transcribe audio only for must-see candidates to limit spend.
- YouTube: the official API cannot supply captions for others' videos. The spec must either accept the unofficial route (Terms risk), use only titles and descriptions, or transcribe audio.
- Newsletters: depends on feed quality per publisher; choose feeds that carry full content.

## Open gaps

- Share of podcasts publishing `<podcast:transcript>`.
- Share of YouTube videos with captions, and a sanctioned way to read them.
- Whether Substack's public feed includes full paywalled posts.
