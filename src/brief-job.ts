import { briefItems } from "./brief.ts";
import type { BriefStore } from "./briefs-db.ts";
import type { Chat } from "./llm.ts";
import { refreshAll } from "./refresh.ts";
import type { Source } from "./render.ts";
import type { Store } from "./store.ts";
import { generateBrief, type Brief } from "./summary.ts";

export interface BriefJobOptions {
  sources: Source[];
  store: Store;
  briefs: BriefStore;
  chat: Chat;
  /** Recorded with the brief, so it is clear what wrote it. */
  model: string;
  profile: string;
  now: () => Date;
  fetchTimeoutMs?: number;
  batchSize?: number;
  onProgress?: (message: string) => void;
}

/** The local calendar date, YYYY-MM-DD. */
export function localDate(at: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/**
 * Refresh the feeds, brief on what is new, and store the result. Items the user struck through, and items an
 * earlier day's brief already showed, are left out. Throws without storing anything if the model fails.
 */
export async function runBriefJob(options: BriefJobOptions): Promise<Brief> {
  const { sources, store, briefs, chat, model, profile, now } = options;
  await refreshAll({ sources, store, now, fetchTimeoutMs: options.fetchTimeoutMs });

  const at = now();
  const date = localDate(at);
  const already = briefs.briefedLinks(date);
  const items = briefItems(store.listItems(), sources, at, store.checkedLinks()).filter(
    (item) => !item.done && !already.has(item.link),
  );

  options.onProgress?.(`Feeds refreshed; briefing ${items.length} items`);
  const brief = await generateBrief({ items, profile, chat, date, batchSize: options.batchSize, onProgress: options.onProgress });
  briefs.save(brief, at.toISOString(), model);
  return brief;
}
