# Source inventory (draft)

Collected from the user's message and the Notion database "Staying Current — Feeds & Check-In List". Platform, feed URL, paywall status and daily volume are NOT yet known.

## Podcasts
- Syntax (https://syntax.fm/), named by user. Feed: https://feeds.megaphone.fm/FSI1483080183 (valid RSS, 1053 items, no podcast:transcript tag as of 2026-11-07)
- The Changelog (https://changelog.com/podcast), named by user; same network: Go Time, Practical AI, Ship It!
- Go Time (https://changelog.com/gotime) [Notion]
- Practical AI (https://changelog.com/practicalai) [Notion]
- Ship It! (https://changelog.com/shipit) [Notion]
- Kubernetes Podcast from Google (https://kubernetespodcast.com) [Notion]
- Latent Space, podcast + free newsletter (https://www.latent.space) [Notion]
- Test & Code (https://testandcode.com) [Notion] **[dropped from v1: no feed]**

## Newsletters
- TLDR: Dev, DevOps, AI, InfoSec, IT, Fintech (https://tldr.tech/newsletters); public archive at e.g. https://tldr.tech/dev/archives (user-observed). Terms of service not yet checked.
- Node Weekly (https://nodeweekly.com/)
- Python Weekly (https://www.pythonweekly.com/) **[dropped from v1: no feed]**
- JavaScript Weekly (https://javascriptweekly.com/)
- Console.dev (https://console.dev) [Notion]
- DevOps Weekly (https://devopsweekly.com) [Notion] **[dropped from v1: no feed]**
- KubeWeekly, CNCF (https://www.cncf.io/kubeweekly/) [Notion] **[dropped from v1: no feed]**
- The Batch, DeepLearning.AI (https://www.deeplearning.ai/the-batch/) [Notion] **[dropped from v1: no feed]**
- The Pragmatic Engineer, free tier + paid (https://newsletter.pragmaticengineer.com) [Notion]
- TLDR Tech (https://tldr.tech) [Notion]

## News sites / aggregators (Notion; neither podcast, YouTube nor newsletter)
- Hacker News (https://news.ycombinator.com), daily
- InfoQ (https://www.infoq.com), weekly

## YouTube
- CNCF (https://www.youtube.com/@cncf), named by user. Channel feed: https://www.youtube.com/feeds/videos.xml?channel_id=UCvqbFHwN-nwalWPjPUKpvTA

## Feed verification (2026-11-07, direct fetch)

Measured on the first 10 items of each feed. "Desc" = median characters of description/summary text after stripping tags; "full" = content:encoded.

Working feeds:
- TLDR: https://tldr.tech/api/rss/{tech,dev,devops,ai,infosec,it,fintech}, 20 items each. Description empty by my measure; titles are issue headlines. Whether item links lead to the full issue not checked.
- Node Weekly https://nodeweekly.com/rss/ and JavaScript Weekly https://javascriptweekly.com/rss/: 4 items each, one item per issue, description ~6-8k chars (issue body with many links).
- Console.dev: https://console.dev/rss.xml (10 items, short desc). Also /reviews/feed.xml (atom, 50) and /tools/rss.xml (4); which one is "the newsletter" is unsettled.
- The Pragmatic Engineer https://newsletter.pragmaticengineer.com/feed: 20 items, full text median ~14k chars. Whether that includes paid posts' full text is not checked; the user reads the free tier only.
- Latent Space newsletter https://www.latent.space/feed (20 items, full text); podcast https://podcast.latent.space/feed.xml (294 eps, 244 with transcript tags).
- Changelog family, all with `<podcast:transcript>` tags: https://changelog.com/podcast/feed (1018 eps, 777 tagged), /gotime/feed (347, 341), /practicalai/feed (381, 375), /shipit/feed (136, 134).
- Kubernetes Podcast https://kubernetespodcast.com/feeds/audio.xml (272 eps, no transcript tags).
- Syntax https://feeds.megaphone.fm/FSI1483080183 (also https://feed.syntax.fm; same 1053 items, no transcript tags in the feed). Per-episode transcripts exist on the site at https://syntax.fm/show/<number>/<slug>/transcript (user-found; verified for #1051, ~65k characters of page text; robots.txt allows it, site terms not checked). Post-v1 relevance only.
- Hacker News https://news.ycombinator.com/rss (30 items, title + link only).
- InfoQ https://feed.infoq.com (15 items, short description).
- CNCF YouTube channel feed (see above), 15 items.

No feed found by autodiscovery or URL guessing:
- Python Weekly (pythonweekly.com): all guessed feed paths return the home page.
- DevOps Weekly (devopsweekly.com): /feed, /feed.xml return 404.
- KubeWeekly (cncf.io/kubeweekly/): cncf.io/feed/ exists but is the general CNCF blog, not KubeWeekly.
- The Batch (deeplearning.ai/the-batch/): /feed and /rss return 404.
- Test & Code: **testandcode.com now redirects to infohondatoto.com, which looks unrelated and untrustworthy. The Notion link is likely stale or the domain was taken over. Do not ingest from it; find the show's feed from a podcast directory.**
