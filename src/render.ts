import type { Item } from "./feed.ts";

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

/** Render stored items to an HTML page. Pure: items in, string out. */
export function renderPage(items: Item[]): string {
  const sorted = [...items].sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""));
  const rows = sorted
    .map((item) => {
      return `<li><a href="${esc(item.link)}">${esc(item.title)}</a> <small>${esc(item.source)}</small><p>${esc(stripTags(item.description))}</p></li>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Daily Brief</title></head>
<body><h1>Daily Brief</h1><ul>
${rows}
</ul></body></html>
`;
}
