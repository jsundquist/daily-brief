import { fetchFeed } from "./feed.ts";
import type { Source } from "./render.ts";
import type { Store } from "./store.ts";

/** At most this many feeds are fetched at the same time. */
const MAX_CONCURRENT_FETCHES = 5;

export interface RefreshOptions {
  sources: Source[];
  store: Store;
  now: () => Date;
  /** Per-feed fetch timeout in milliseconds. */
  fetchTimeoutMs?: number;
}

/** Fetch one source. A failure is recorded and never propagates to the others. */
async function refreshSource(source: Source, { store, now, fetchTimeoutMs }: RefreshOptions): Promise<void> {
  try {
    const items = await fetchFeed(source.url, source.name, source.cap, fetchTimeoutMs, source.articles);
    if (source.cap === undefined && source.articles === undefined) {
      store.upsertItems(items);
    } else {
      store.replaceSourceItems(source.name, items);
    }
    store.recordSuccess(source.name, now().toISOString());
  } catch (error) {
    store.recordFailure(source.name, now().toISOString());
    console.error(`Failed to fetch ${source.name}:`, error);
  }
}

/** Fetch every source once, a few at a time, then prune the store. */
export async function refreshAll(options: RefreshOptions): Promise<void> {
  const queue = [...options.sources];
  const worker = async (): Promise<void> => {
    for (let source = queue.shift(); source !== undefined; source = queue.shift()) {
      await refreshSource(source, options);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_FETCHES, queue.length) }, worker));
  options.store.prune(options.now());
}
