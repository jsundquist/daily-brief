import type { ArticleFormat } from "./articles.ts";
import type { Item } from "./feed.ts";
import { displayedItems, podcastItems } from "./window.ts";
import type { SourceStatus } from "./store.ts";

export type SourceType = "podcast" | "youtube" | "newsletter" | "news";

export interface Source {
  name: string;
  type: SourceType;
  url: string;
  /** Keep at most this many items from the feed (in feed order). */
  cap?: number;
  /** Split each issue of this newsletter into its individual articles. */
  articles?: ArticleFormat;
}

/** A source shows a warning after this many consecutive failed fetches. */
export const WARN_AFTER_FAILURES = 3;

const TYPE_ORDER: { type: SourceType; heading: string }[] = [
  { type: "podcast", heading: "Podcasts" },
  { type: "youtube", heading: "YouTube" },
  { type: "newsletter", heading: "Newsletters" },
  { type: "news", heading: "News sites" },
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

/** Descriptions are shown at about this many characters; the store keeps the full text. */
const MAX_DESCRIPTION_CHARS = 300;

function truncateAtWord(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  const cut = value.slice(0, limit);
  const lastSpace = cut.search(/\s\S*$/);
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function isFailing(status: SourceStatus | undefined): boolean {
  return status !== undefined && status.consecutiveFailures >= WARN_AFTER_FAILURES && status.failingSince !== null;
}

/** Every link leaves the brief in a new tab, without handing the opener or referrer to the target. */
function externalLink(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
}

function renderItem(item: Item, checked: Set<string>): string {
  const doneClass = checked.has(item.link) ? ' class="done"' : "";
  return `<li><div${doneClass} data-link="${escapeHtml(item.link)}">${externalLink(item.link, item.title)} <small>${escapeHtml(item.source)}</small><p>${escapeHtml(truncateAtWord(stripTags(item.description), MAX_DESCRIPTION_CHARS))}</p></div></li>`;
}

/** Podcasts read as one list: day, then "title (producer)" with the summary underneath. */
function renderPodcasts(items: Item[], sources: Source[], now: Date, statuses: Record<string, SourceStatus>, checked: Set<string>): string {
  const names = new Set(sources.map((source) => source.name));
  const recent = podcastItems(items.filter((item) => names.has(item.source)), now);
  const warnings = sources
    .filter((source) => isFailing(statuses[source.name]))
    .map((source) => renderStatus(statuses[source.name], source.name))
    .join("");
  const days = new Map<string, Item[]>();
  for (const item of recent) {
    const day = (item.published as string).slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  const body = [...days.keys()]
    .sort()
    .reverse()
    .map((day) => {
      const rows = (days.get(day) as Item[]).map((item) => {
        const doneClass = checked.has(item.link) ? ' class="done"' : "";
        return `<li><div${doneClass} data-link="${escapeHtml(item.link)}">${externalLink(item.link, item.title)} <small>(${escapeHtml(item.source)})</small><p>${escapeHtml(truncateAtWord(stripTags(item.description), MAX_DESCRIPTION_CHARS))}</p></div></li>`;
      });
      return `<h4>${day}</h4><ul>\n${rows.join("\n")}\n</ul>`;
    })
    .join("\n");
  return `${warnings}${body}`;
}

function formatUtc(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

function renderStatus(status: SourceStatus | undefined, label?: string): string {
  const lastSuccess = status?.lastSuccess ?? null;
  const updated = label !== undefined ? escapeHtml(label) : lastSuccess === null ? "Never updated" : `Updated ${formatUtc(lastSuccess)}`;
  const warning =
    status !== undefined && isFailing(status)
      ? ` <strong class="warning">Warning: failing since ${formatUtc(status.failingSince as string)} (${status.consecutiveFailures} failed fetches)</strong>`
      : "";
  return `<p><small>${updated}</small>${warning}</p>\n`;
}

function renderSource(name: string, items: Item[], status: SourceStatus | undefined, checked: Set<string>): string {
  const days = new Map<string, Item[]>();
  for (const item of items) {
    const day = (item.published as string).slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  const dayKeys = [...days.keys()].sort().reverse();
  const body = dayKeys
    .map((day) => {
      const dayItems = (days.get(day) as Item[]).sort((a, b) =>
        (b.published as string).localeCompare(a.published as string),
      );
      return `<h4>${day}</h4><ul>\n${dayItems.map((item) => renderItem(item, checked)).join("\n")}\n</ul>`;
    })
    .join("\n");
  return `<section><h3>${escapeHtml(name)}</h3>\n${renderStatus(status)}${body}\n</section>`;
}

/** Render stored items to an HTML page grouped by type, source, day. Pure. */
export function renderPage(items: Item[], sources: Source[], now: Date, statuses: Record<string, SourceStatus>, checked: Set<string>): string {
  const sections = TYPE_ORDER.map(({ type, heading }) => {
    if (type === "podcast") {
      const podcasts = renderPodcasts(items, sources.filter((source) => source.type === "podcast"), now, statuses, checked);
      return podcasts === "" ? "" : `<section><h2>${heading}</h2>\n${podcasts}\n</section>`;
    }
    const rendered = sources
      .filter((source) => source.type === type)
      .map((source) =>
        renderSource(
          source.name,
          displayedItems(items.filter((item) => item.source === source.name), now),
          statuses[source.name],
          checked,
        ),
      );
    return rendered.length === 0 ? "" : `<section><h2>${heading}</h2>\n${rendered.join("\n")}\n</section>`;
  }).filter((section) => section !== "");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Daily Brief</title>
<style>div.done { text-decoration: line-through; opacity: 0.6; } div[data-link] { cursor: pointer; }</style></head>
<body><h1>Daily Brief</h1>
<div id="content">
${sections.join("\n")}
</div>
<script>
document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element) || target.closest("a")) {
    return;
  }
  const li = target.closest("[data-link]");
  if (!li) {
    return;
  }
  fetch("/toggle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ link: li.getAttribute("data-link") }),
  }).then((response) => {
    if (response.ok) {
      li.classList.toggle("done");
    }
  });
});
let version = null;
async function poll() {
  try {
    const next = await (await fetch("/version")).text();
    if (version !== null && next !== version) {
      const html = await (await fetch("/")).text();
      const fresh = new DOMParser().parseFromString(html, "text/html").getElementById("content");
      const current = document.getElementById("content");
      if (fresh && current) {
        current.innerHTML = fresh.innerHTML;
      }
    }
    version = next;
  } catch {}
}
poll();
setInterval(poll, 30000);
</script>
</body></html>
`;
}
