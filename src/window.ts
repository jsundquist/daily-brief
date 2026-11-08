import { isHttpUrl, type Item } from "./feed.ts";

/** Every item from this long ago until now is shown. */
export const WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/** A source always shows at least its latest this many items, however old. */
export const LATEST_PER_SOURCE = 3;

/** The store keeps this many of a source's latest items (more if the page shows more). */
export const BUFFER_PER_SOURCE = 20;

/** Podcasts show everything from this long ago until now, and nothing older. */
export const PODCAST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function newestFirst(a: Item, b: Item): number {
  return (b.published ?? "").localeCompare(a.published ?? "");
}

/** The items of ONE source the page shows: the 3-day window plus its latest 3, de-duplicated. */
export function displayedItems(sourceItems: Item[], now: Date): Item[] {
  const cutoff = new Date(now.getTime() - WINDOW_MS).toISOString();
  const showable = sourceItems.filter((item) => item.published !== null && isHttpUrl(item.link)).sort(newestFirst);
  return showable.filter((item, index) => index < LATEST_PER_SOURCE || (item.published as string) >= cutoff);
}

/** The items of ONE source worth storing: everything displayed plus the latest BUFFER_PER_SOURCE. */
export function keptItems(sourceItems: Item[], now: Date): Item[] {
  const shown = new Set(displayedItems(sourceItems, now));
  const newest = [...sourceItems].sort(newestFirst).slice(0, BUFFER_PER_SOURCE);
  return sourceItems.filter((item) => shown.has(item) || newest.includes(item));
}

/** The podcast items shown: published within the last month, newest first. */
export function podcastItems(sourceItems: Item[], now: Date): Item[] {
  const cutoff = new Date(now.getTime() - PODCAST_WINDOW_MS).toISOString();
  return sourceItems
    .filter((item) => item.published !== null && item.published >= cutoff && isHttpUrl(item.link))
    .sort(newestFirst);
}
