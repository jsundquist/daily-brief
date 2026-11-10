import { isHttpUrl, type Item } from "./feed.ts";

/** How a newsletter's issue is split into its articles. */
export type ArticleFormat = "cooperpress" | "tldr";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…" };

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(parseInt(entity.slice(1), 10));
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** HTML to one line of plain text. */
function plainText(html: string): string {
  return decodeEntities(html.replace(/<\/?(?:p|li|ul|ol|br|div|h\d|tr|td|table)\b[^>]*>/gi, " ").replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

/** Decode an href (TLDR double-encodes its ampersands) and drop tracking parameters. */
function cleanLink(href: string): string {
  let link = href.trim();
  for (let pass = 0; pass < 3 && link.includes("&amp;"); pass++) {
    link = decodeEntities(link);
  }
  link = decodeEntities(link);
  try {
    const url = new URL(link);
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return link;
  }
}

function article(issue: Item, title: string, href: string, description: string): Item | null {
  const link = cleanLink(href);
  if (title === "" || !isHttpUrl(link)) {
    return null;
  }
  return { title, link, description, published: issue.published, source: issue.source };
}

/** Node Weekly and JavaScript Weekly: every article is its own table in the issue's HTML; sponsors are skipped. */
export function cooperpressArticles(issue: Item): Item[] {
  const found: Item[] = [];
  for (const table of issue.description.split(/<\/table>/i)) {
    const match = /<span[^>]*>\s*<a href="([^"]+)"[^>]*>(.*?)<\/a>\s*<\/span>\s*(?:—|&mdash;|-)?\s*([\s\S]*?)<\/p>/i.exec(table);
    if (!match || /sponsor\s*<\/span>/i.test(table)) {
      continue;
    }
    const item = article(issue, plainText(match[2] as string), match[1] as string, plainText(match[3] as string));
    if (item !== null) {
      found.push(item);
    }
  }
  return found;
}

/** A TLDR issue page: every article is an `<article>` with a heading link and a blurb; sponsors are skipped. */
export function tldrArticles(page: string, issue: Item): Item[] {
  const found: Item[] = [];
  for (const chunk of page.split(/<article\b/i).slice(1)) {
    const head = /<a[^>]*href="([^"]+)"[^>]*>\s*<h3>([\s\S]*?)<\/h3>/i.exec(chunk);
    if (!head) {
      continue;
    }
    const title = plainText(head[2] as string);
    if (/\(sponsor\)\s*$/i.test(title)) {
      continue;
    }
    const blurb = /<div class="newsletter-html">([\s\S]*?)<\/div>/i.exec(chunk);
    const item = article(issue, title, head[1] as string, plainText(blurb?.[1] ?? ""));
    if (item !== null) {
      found.push(item);
    }
  }
  return found;
}
