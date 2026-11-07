import type { Source } from "./render.ts";

/** The one place to add or remove a source. Feeds verified 2026-11-07 (see .scratch/daily-brief/sources.md). */
export const sources: Source[] = [
  { name: "Syntax", type: "podcast", url: "https://feeds.megaphone.fm/FSI1483080183" },
  { name: "The Changelog", type: "podcast", url: "https://changelog.com/podcast/feed" },
  { name: "Go Time", type: "podcast", url: "https://changelog.com/gotime/feed" },
  { name: "Practical AI", type: "podcast", url: "https://changelog.com/practicalai/feed" },
  { name: "Ship It!", type: "podcast", url: "https://changelog.com/shipit/feed" },
  { name: "Latent Space (podcast)", type: "podcast", url: "https://podcast.latent.space/feed.xml" },
  { name: "Kubernetes Podcast from Google", type: "podcast", url: "https://kubernetespodcast.com/feeds/audio.xml" },
  {
    name: "CNCF",
    type: "youtube",
    url: "https://www.youtube.com/feeds/videos.xml?channel_id=UCvqbFHwN-nwalWPjPUKpvTA",
  },
  { name: "TLDR Tech", type: "newsletter", url: "https://tldr.tech/api/rss/tech" },
  { name: "TLDR Dev", type: "newsletter", url: "https://tldr.tech/api/rss/dev" },
  { name: "TLDR DevOps", type: "newsletter", url: "https://tldr.tech/api/rss/devops" },
  { name: "TLDR AI", type: "newsletter", url: "https://tldr.tech/api/rss/ai" },
  { name: "TLDR InfoSec", type: "newsletter", url: "https://tldr.tech/api/rss/infosec" },
  { name: "TLDR IT", type: "newsletter", url: "https://tldr.tech/api/rss/it" },
  { name: "TLDR Fintech", type: "newsletter", url: "https://tldr.tech/api/rss/fintech" },
  { name: "Node Weekly", type: "newsletter", url: "https://nodeweekly.com/rss/" },
  { name: "JavaScript Weekly", type: "newsletter", url: "https://javascriptweekly.com/rss/" },
  { name: "Console.dev", type: "newsletter", url: "https://console.dev/rss.xml" },
  { name: "The Pragmatic Engineer", type: "newsletter", url: "https://newsletter.pragmaticengineer.com/feed" },
  { name: "Latent Space (newsletter)", type: "newsletter", url: "https://www.latent.space/feed" },
  { name: "Hacker News", type: "news", url: "https://news.ycombinator.com/rss", cap: 10 },
  { name: "InfoQ", type: "news", url: "https://feed.infoq.com" },
];
