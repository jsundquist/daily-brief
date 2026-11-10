import type { Item } from "./feed.ts";
import { summarize, type Source, type SourceType } from "./render.ts";
import { shownItems } from "./window.ts";

export interface BriefItem {
  type: SourceType;
  /** Newsletters only. */
  cadence?: "daily" | "weekly";
  source: string;
  title: string;
  link: string;
  published: string;
  summary: string;
  /** Struck through on the page: already looked at or skipped. */
  done: boolean;
}

/** Exactly the items the page shows, as data, newest first. */
export function briefItems(items: Item[], sources: Source[], now: Date, checked: Set<string>): BriefItem[] {
  return sources
    .flatMap((source) =>
      shownItems(items.filter((item) => item.source === source.name), source, now).map((item) => ({
        type: source.type,
        ...(source.type === "newsletter" ? { cadence: source.cadence ?? ("daily" as const) } : {}),
        source: source.name,
        title: item.title,
        link: item.link,
        published: item.published as string,
        summary: summarize(item.description),
        done: checked.has(item.link),
      })),
    )
    .sort((a, b) => b.published.localeCompare(a.published));
}
