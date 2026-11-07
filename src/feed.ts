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

/** Parse RSS 2.0 XML into normalised items. Throws on invalid input. */
export function parseFeed(xml: string, source: string): Item[] {
  const doc = parser.parse(xml);
  const rawItems = toArray(doc?.rss?.channel?.item);
  const items: Item[] = [];
  for (const raw of rawItems) {
    const link = text(raw.link);
    if (link === "") {
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

export async function fetchFeed(url: string, source: string): Promise<Item[]> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`Feed ${url} responded ${response.status}`);
  }
  return parseFeed(await response.text(), source);
}
