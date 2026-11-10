import { decodeEntities, type ArticleFormat } from "./articles.ts";
import type { Item } from "./feed.ts";
import { shownItems } from "./window.ts";
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
  /** Newsletters only: "weekly" shows just the last day published; the default "daily" shows the last 4 days. */
  cadence?: "daily" | "weekly";
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
  return decodeEntities(value.replace(/<[^>]*>/g, ""));
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

/** A feed description as plain text, shortened the way the page shows it. */
export function summarize(description: string): string {
  return truncateAtWord(stripTags(description), MAX_DESCRIPTION_CHARS);
}

/** Every link leaves the brief in a new tab, without handing the opener or referrer to the target. */
function externalLink(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(decodeEntities(label))}</a>`;
}

function renderItem(item: Item, checked: Set<string>): string {
  const doneClass = checked.has(item.link) ? ' class="done"' : "";
  return `<li><div${doneClass} data-link="${escapeHtml(item.link)}">${externalLink(item.link, item.title)} <small>${escapeHtml(item.source)}</small><p>${escapeHtml(truncateAtWord(stripTags(item.description), MAX_DESCRIPTION_CHARS))}</p></div></li>`;
}

/** Items from several sources as one list: day, then "title (source)" with the summary underneath. */
function renderDayList(items: Item[], sources: Source[], statuses: Record<string, SourceStatus>, checked: Set<string>): string {
  const warnings = sources
    .filter((source) => isFailing(statuses[source.name]))
    .map((source) => renderStatus(statuses[source.name], source.name))
    .join("");
  const days = new Map<string, Item[]>();
  for (const item of items) {
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

/** A top-level type section: collapsible, colour-coded by type, with an anchor for the jump bar. */
function typeSection(type: SourceType, heading: string, body: string): string {
  const count = (body.match(/<li>/g) ?? []).length;
  return `<section class="type type-${type}" id="${type}"><details open data-key="${type}"><summary><h2>${heading}</h2><span class="count">${count}</span></summary>\n${body}\n</details></section>`;
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
    const ofType = sources.filter((source) => source.type === type);
    const shownOf = (source: Source): Item[] => shownItems(items.filter((item) => item.source === source.name), source, now);
    if (type === "podcast") {
      const list = renderDayList(ofType.flatMap(shownOf), ofType, statuses, checked);
      return list === "" ? "" : typeSection(type, heading, list);
    }
    if (type === "newsletter") {
      const groups = [
        { title: "Daily", ofCadence: ofType.filter((source) => source.cadence !== "weekly") },
        { title: "Weekly", ofCadence: ofType.filter((source) => source.cadence === "weekly") },
      ].map(({ title, ofCadence }) => {
        const list = renderDayList(ofCadence.flatMap(shownOf), ofCadence, statuses, checked);
        return list === "" ? "" : `<section><h3>${title}</h3>\n${list}\n</section>`;
      });
      const body = groups.filter((group) => group !== "").join("\n");
      return body === "" ? "" : typeSection(type, heading, body);
    }
    const rendered = ofType.map((source) => renderSource(source.name, shownOf(source), statuses[source.name], checked));
    return rendered.length === 0 ? "" : typeSection(type, heading, rendered.join("\n"));
  }).filter((section) => section !== "");
  const nav = TYPE_ORDER.filter(({ heading }) => sections.some((section) => section.includes(`<h2>${heading}</h2>`)))
    .map(({ type, heading }) => `<a class="type-${type}" href="#${type}">${heading}</a>`)
    .join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Daily Brief</title>
<style>
:root { --bg: #f4f5f7; --card: #ffffff; --text: #1d2330; --muted: #6a7385; --line: #e3e6ec; --link: #1a4fd6; --podcast: #7c3aed; --youtube: #dc2626; --newsletter: #0891b2; --news: #ea7a0b; }
@media (prefers-color-scheme: dark) { :root { --bg: #14171f; --card: #1d212c; --text: #e6e9f0; --muted: #98a1b5; --line: #2b3040; --link: #8fb0ff; --podcast: #a78bfa; --youtube: #f87171; --newsletter: #22d3ee; --news: #fb9f3c; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
header.bar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 18px; padding: 10px 24px; background: var(--card); border-bottom: 1px solid var(--line); }
header.bar h1 { margin: 0; font-size: 18px; letter-spacing: -0.01em; }
header.bar nav { display: flex; gap: 8px; flex-wrap: wrap; }
header.bar nav a { padding: 3px 11px; border-radius: 999px; font-size: 13px; font-weight: 600; text-decoration: none; color: #fff; }
nav a.type-podcast { background: var(--podcast); } nav a.type-youtube { background: var(--youtube); } nav a.type-newsletter { background: var(--newsletter); } nav a.type-news { background: var(--news); }
#content { max-width: 920px; margin: 0 auto; padding: 20px 24px 60px; }
section.type { margin: 0 0 22px; background: var(--card); border: 1px solid var(--line); border-top: 4px solid var(--accent); border-radius: 10px; scroll-margin-top: 60px; }
.type-podcast { --accent: var(--podcast); } .type-youtube { --accent: var(--youtube); } .type-newsletter { --accent: var(--newsletter); } .type-news { --accent: var(--news); }
summary { display: flex; align-items: center; gap: 10px; padding: 12px 18px; cursor: pointer; list-style: none; }
summary::-webkit-details-marker { display: none; }
summary::before { content: "\\25B8"; color: var(--accent); transition: transform .12s; }
details[open] > summary::before { transform: rotate(90deg); }
h2 { margin: 0; font-size: 19px; color: var(--accent); }
.count { margin-left: auto; padding: 1px 10px; border-radius: 999px; background: var(--bg); color: var(--muted); font-size: 12px; font-weight: 600; }
section.type section { padding: 0 18px 6px; }
section.type section > h3 { margin: 12px 0 2px; font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
h4 { position: sticky; top: 49px; z-index: 1; margin: 0; padding: 6px 18px; background: color-mix(in srgb, var(--accent) 10%, var(--card)); color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: .06em; border-top: 1px solid var(--line); }
section.type section h4 { margin: 0 -18px; }
ul { list-style: none; margin: 0; padding: 0; }
li { border-top: 1px solid var(--line); } li:first-child { border-top: 0; }
div[data-link] { padding: 9px 18px; cursor: pointer; } section.type section div[data-link] { margin: 0 -18px; }
div[data-link]:hover { background: color-mix(in srgb, var(--accent) 6%, var(--card)); }
div[data-link] a { font-weight: 600; color: var(--link); text-decoration: none; } div[data-link] a:hover { text-decoration: underline; }
div[data-link] small { color: var(--accent); font-weight: 600; font-size: 12px; margin-left: 4px; }
div[data-link] p { margin: 2px 0 0; color: var(--muted); font-size: 13.5px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
div.done { opacity: .45; } div.done a, div.done p { text-decoration: line-through; }
p small { color: var(--muted) !important; font-weight: 400 !important; }
.warning { color: #b91c1c; }
</style></head>
<body><header class="bar"><h1>Daily Brief</h1><nav>${nav}</nav></header>
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
function restoreCollapsed() {
  try {
    for (const d of document.querySelectorAll("details[data-key]")) {
      if (localStorage.getItem("collapsed:" + d.getAttribute("data-key")) === "1") {
        d.open = false;
      }
    }
  } catch {}
}
document.addEventListener("toggle", (event) => {
  const d = event.target;
  if (d instanceof HTMLDetailsElement && d.hasAttribute("data-key")) {
    try {
      localStorage.setItem("collapsed:" + d.getAttribute("data-key"), d.open ? "0" : "1");
    } catch {}
  }
}, true);
restoreCollapsed();
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
        restoreCollapsed();
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
