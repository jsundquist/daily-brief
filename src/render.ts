import type { Item } from "./feed.ts";

export type SourceType = "podcast" | "youtube" | "newsletter" | "news";

export interface Source {
  name: string;
  type: SourceType;
  url: string;
  /** Keep at most this many items from the feed (in feed order). */
  cap?: number;
}

const WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const TYPE_ORDER: { type: SourceType; heading: string }[] = [
  { type: "podcast", heading: "Podcasts" },
  { type: "youtube", heading: "YouTube" },
  { type: "newsletter", heading: "Newsletters" },
  { type: "news", heading: "News sites" },
];

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "");
}

function renderItem(item: Item, checked: Set<string>): string {
  const cls = checked.has(item.link) ? ' class="done"' : "";
  return `<li><div${cls} data-link="${esc(item.link)}"><a href="${esc(item.link)}">${esc(item.title)}</a> <small>${esc(item.source)}</small><p>${esc(stripTags(item.description))}</p></div></li>`;
}

function renderSource(name: string, items: Item[], checked: Set<string>): string {
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
  return `<section><h3>${esc(name)}</h3>\n${body}\n</section>`;
}

/** Render stored items to an HTML page grouped by type, source, day. Pure. */
export function renderPage(items: Item[], sources: Source[], now: Date, checked: Set<string> = new Set()): string {
  const cutoff = new Date(now.getTime() - WINDOW_MS).toISOString();
  const recent = items.filter((item) => item.published !== null && item.published >= cutoff);
  const sections = TYPE_ORDER.map(({ type, heading }) => {
    const rendered = sources
      .filter((source) => source.type === type)
      .map((source) => ({ source, items: recent.filter((item) => item.source === source.name) }))
      .filter((entry) => entry.items.length > 0)
      .map((entry) => renderSource(entry.source.name, entry.items, checked));
    return rendered.length === 0 ? "" : `<section><h2>${heading}</h2>\n${rendered.join("\n")}\n</section>`;
  }).filter((section) => section !== "");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Daily Brief</title>
<style>div.done { text-decoration: line-through; opacity: 0.6; } div[data-link] { cursor: pointer; }</style></head>
<body><h1>Daily Brief</h1>
${sections.join("\n")}
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
</script>
</body></html>
`;
}
