import { isHttpUrl, type Item } from "./feed.ts";
import type { Source } from "./render.ts";

/** Every item from this long ago until now is shown. */
export const WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * A source always shows at least its latest this many publications, however old. Articles split out of one
 * newsletter issue share the issue's date and count as one publication.
 */
export const LATEST_PER_SOURCE = 3;

/** The store keeps this many of a source's latest publications (more if the page shows more). */
export const BUFFER_PER_SOURCE = 20;

/** Podcasts and daily newsletters show everything from this long ago until now, and nothing older. */
export const RECENT_WINDOW_MS = 4 * 24 * 60 * 60 * 1000;

function newestFirst(a: Item, b: Item): number {
  return (b.published ?? "").localeCompare(a.published ?? "");
}

/** The items of ONE source the page shows: the 3-day window plus its latest 3, de-duplicated. */
export function displayedItems(sourceItems: Item[], now: Date): Item[] {
  const cutoff = new Date(now.getTime() - WINDOW_MS).toISOString();
  const showable = sourceItems.filter((item) => item.published !== null && isHttpUrl(item.link)).sort(newestFirst);
  const latest = new Set<string>();
  for (const item of showable) {
    if (latest.size < LATEST_PER_SOURCE) {
      latest.add(item.published as string);
    }
  }
  return showable.filter((item) => latest.has(item.published as string) || (item.published as string) >= cutoff);
}

/** The items of ONE source worth storing: everything displayed plus the latest BUFFER_PER_SOURCE. */
export function keptItems(sourceItems: Item[], now: Date): Item[] {
  const shown = new Set(displayedItems(sourceItems, now));
  const newest = new Set<string>();
  for (const item of [...sourceItems].sort(newestFirst)) {
    if (newest.size < BUFFER_PER_SOURCE) {
      newest.add(item.published ?? "");
    }
  }
  return sourceItems.filter((item) => shown.has(item) || newest.has(item.published ?? ""));
}

/** The items shown for podcasts and daily newsletters: published within the last 4 days, newest first. */
export function recentItems(sourceItems: Item[], now: Date): Item[] {
  const cutoff = new Date(now.getTime() - RECENT_WINDOW_MS).toISOString();
  return sourceItems
    .filter((item) => item.published !== null && item.published >= cutoff && isHttpUrl(item.link))
    .sort(newestFirst);
}

/** The items shown for ONE weekly newsletter: everything from the last day it published, however old. */
export function latestDayItems(sourceItems: Item[]): Item[] {
  const showable = sourceItems.filter((item) => item.published !== null && isHttpUrl(item.link)).sort(newestFirst);
  const day = showable[0]?.published?.slice(0, 10);
  return showable.filter((item) => (item.published as string).slice(0, 10) === day);
}

/** The items of ONE source the page and the brief show, by the source's type and cadence. */
export function shownItems(sourceItems: Item[], source: Source, now: Date): Item[] {
  if (source.type === "podcast") {
    return recentItems(sourceItems, now);
  }
  if (source.type === "newsletter") {
    return source.cadence === "weekly" ? latestDayItems(sourceItems) : recentItems(sourceItems, now);
  }
  return displayedItems(sourceItems, now);
}
