import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Item } from "./feed.ts";

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
  sources?: Record<string, SourceStatus>;
}

/** JSON-file store. Items are keyed by link. */
export class Store {
  private data: StoreData;
  private file: string;

  constructor(file: string) {
    this.file = file;
    this.data = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : { items: {} };
  }

  upsertItems(items: Item[]): void {
    for (const item of items) {
      this.data.items[item.link] = item;
    }
    this.save();
  }

  recordSuccess(source: string, at: string): void {
    this.sourceMap()[source] = { lastSuccess: at, consecutiveFailures: 0, failingSince: null };
    this.save();
  }

  recordFailure(source: string, at: string): void {
    const previous = this.sourceMap()[source] ?? { lastSuccess: null, consecutiveFailures: 0, failingSince: null };
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

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(this.data, null, 2));
    renameSync(temp, this.file);
  }
}
