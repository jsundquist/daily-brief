import { XMLParser } from "fast-xml-parser";

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
  return items;
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
  return items;
}

export async function fetchFeed(url: string, source: string, cap?: number, timeoutMs = 15_000): Promise<Item[]> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`Feed ${url} responded ${response.status}`);
  }
  const items = parseFeed(await response.text(), source);
  return cap === undefined ? items : items.slice(0, cap);
}
