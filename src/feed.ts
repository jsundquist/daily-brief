import { XMLParser } from "fast-xml-parser";
import { cooperpressArticles, tldrArticles, type ArticleFormat } from "./articles.ts";

export interface Item {
  title: string;
  link: string;
  description: string;
  published: string | null;
  source: string;
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function text(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "object") {
    const inner = (value as Record<string, unknown>)["#text"];
    return inner === undefined ? "" : String(inner).trim();
  }
  return String(value).trim();
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function isoDate(value: string): string | null {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** Only http(s) links may become an href or a stored item. */
export function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value.trim()).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Paid placements ("Sponsor: Acme") are not content. */
function isSponsored(item: Item): boolean {
  return /^sponsor(ed)?\s*:/i.test(item.title);
}

function atomLink(value: unknown): string {
  const links = toArray(value as Record<string, string> | Record<string, string>[] | undefined);
  const alternate = links.find((l) => l["@_rel"] === undefined || l["@_rel"] === "alternate");
  return alternate?.["@_href"] ?? "";
}

function parseAtom(feed: { entry?: unknown }, source: string): Item[] {
  const items: Item[] = [];
  for (const raw of toArray(feed.entry as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
    const link = atomLink(raw.link);
    if (!isHttpUrl(link)) {
      continue;
    }
    const media = (raw["media:group"] ?? {}) as Record<string, unknown>;
    items.push({
      title: text(raw.title),
      link,
      description: text(raw.summary) || text(media["media:description"]),
      published: isoDate(text(raw.published) || text(raw.updated)),
      source,
    });
  }
  return items.filter((item) => !isSponsored(item));
}

/** Parse RSS 2.0 or Atom XML into normalised items. Throws on invalid input. */
export function parseFeed(xml: string, source: string): Item[] {
  const doc = parser.parse(xml);
  if (!doc?.feed && !doc?.rss) {
    throw new Error(`Feed for ${source} is not RSS or Atom`);
  }
  if (doc?.feed) {
    return parseAtom(doc.feed, source);
  }
  const rawItems = toArray(doc?.rss?.channel?.item);
  const items: Item[] = [];
  for (const raw of rawItems) {
    const link = text(raw.link);
    if (!isHttpUrl(link)) {
      continue;
    }
    items.push({
      title: text(raw.title),
      link,
      description: text(raw.description),
      published: isoDate(text(raw.pubDate)),
      source,
    });
  }
  return items.filter((item) => !isSponsored(item));
}

/** A TLDR feed lists one page per day; only the newest few pages are fetched on each refresh. */
const TLDR_ISSUES_PER_REFRESH = 3;

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`Feed ${url} responded ${response.status}`);
  }
  return response.text();
}

/** Retry a page that fails (TLDR throttles at random): up to 3 tries, a growing pause between them. */
async function fetchTextWithRetry(url: string, timeoutMs: number, pauseMs = 1000): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetchText(url, timeoutMs);
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, pauseMs * attempt));
    }
  }
}

export async function fetchFeed(
  url: string,
  source: string,
  cap?: number,
  timeoutMs = 15_000,
  articles?: ArticleFormat,
): Promise<Item[]> {
  const items = parseFeed(await fetchText(url, timeoutMs), source);
  if (articles === "cooperpress") {
    return items.flatMap(cooperpressArticles);
  }
  if (articles === "tldr") {
    const issues = items
      .sort((a, b) => (b.published ?? "").localeCompare(a.published ?? ""))
      .slice(0, TLDR_ISSUES_PER_REFRESH);
    // One page at a time: TLDR answers a burst of parallel requests with errors.
    const found: Item[] = [];
    let lastError: unknown = null;
    let fetched = 0;
    for (const issue of issues) {
      try {
        found.push(...tldrArticles(await fetchTextWithRetry(issue.link, timeoutMs), issue));
        fetched += 1;
      } catch (error) {
        lastError = error;
      }
    }
    if (issues.length > 0 && fetched === 0) {
      throw new Error(`No issue page of ${source} could be fetched`, { cause: lastError });
    }
    return found;
  }
  return cap === undefined ? items : items.slice(0, cap);
}
