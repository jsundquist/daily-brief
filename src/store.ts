import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Item } from "./feed.ts";
import { keptItems } from "./window.ts";

export interface SourceStatus {
  /** ISO time of the last successful fetch, or null if none yet. */
  lastSuccess: string | null;
  /** Fetches failed in a row since the last success. */
  consecutiveFailures: number;
  /** ISO time of the first failure in the current streak. */
  failingSince: string | null;
}

interface StoreData {
  items: Record<string, Item>;
  /** Links of items struck through. */
  checked?: Record<string, true>;
  sources?: Record<string, SourceStatus>;
}

function itemKey(item: Item): string {
  return `${item.source}\n${item.link}`;
}

function emptyStatus(): SourceStatus {
  return { lastSuccess: null, consecutiveFailures: 0, failingSince: null };
}

/** Read the store file. If it is unreadable, keep a copy of it and start empty so a restart never crash-loops. */
function loadOrQuarantine(file: string): StoreData {
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    if (typeof data !== "object" || data === null || Array.isArray(data) || typeof data.items !== "object" || data.items === null) {
      throw new Error("store file has an unexpected shape");
    }
    return data;
  } catch (error) {
    const aside = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    renameSync(file, aside);
    console.error(`Store file ${file} is corrupt (${error}); moved to ${aside}, starting empty.`);
    return { items: {} };
  }
}

/** JSON-file store. Items are keyed by source plus link; check-off is keyed by link alone. */
export class Store {
  private data: StoreData;
  private file: string;

  constructor(file: string) {
    this.file = file;
    this.data = existsSync(file) ? loadOrQuarantine(file) : { items: {} };
    // Older stores keyed items by link alone; re-key them.
    this.data.items = Object.fromEntries(Object.values(this.data.items).map((item) => [itemKey(item), item]));
  }

  upsertItems(items: Item[]): void {
    for (const item of items) {
      this.data.items[itemKey(item)] = item;
    }
    this.save();
  }

  /** Replace everything stored for a source (used for capped sources). */
  replaceSourceItems(source: string, items: Item[]): void {
    for (const [key, item] of Object.entries(this.data.items)) {
      if (item.source === source) {
        delete this.data.items[key];
      }
    }
    this.upsertItems(items);
  }

  /** Drop items the page cannot show and is not buffering, and check-off state for items that are gone. */
  prune(now: Date): void {
    const bySource = new Map<string, Item[]>();
    for (const item of Object.values(this.data.items)) {
      bySource.set(item.source, [...(bySource.get(item.source) ?? []), item]);
    }
    this.data.items = {};
    for (const items of bySource.values()) {
      for (const item of keptItems(items, now)) {
        this.data.items[itemKey(item)] = item;
      }
    }
    const links = new Set(Object.values(this.data.items).map((item) => item.link));
    for (const link of Object.keys(this.data.checked ?? {})) {
      if (!links.has(link)) {
        delete (this.data.checked as Record<string, true>)[link];
      }
    }
    this.save();
  }

  recordSuccess(source: string, at: string): void {
    this.sourceMap()[source] = { ...emptyStatus(), lastSuccess: at };
    this.save();
  }

  recordFailure(source: string, at: string): void {
    const previous = this.sourceMap()[source] ?? emptyStatus();
    this.sourceMap()[source] = {
      lastSuccess: previous.lastSuccess,
      consecutiveFailures: previous.consecutiveFailures + 1,
      failingSince: previous.failingSince ?? at,
    };
    this.save();
  }

  sourceStatuses(): Record<string, SourceStatus> {
    return this.sourceMap();
  }

  private sourceMap(): Record<string, SourceStatus> {
    this.data.sources ??= {};
    return this.data.sources;
  }

  listItems(): Item[] {
    return Object.values(this.data.items);
  }

  hasLink(link: string): boolean {
    return Object.values(this.data.items).some((item) => item.link === link);
  }

  toggleChecked(link: string): void {
    const checked = (this.data.checked ??= {});
    if (checked[link]) {
      delete checked[link];
    } else {
      checked[link] = true;
    }
    this.save();
  }

  checkedLinks(): Set<string> {
    return new Set(Object.keys(this.data.checked ?? {}));
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(this.data, null, 2));
    renameSync(temp, this.file);
  }
}
