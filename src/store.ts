import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Item } from "./feed.ts";

interface StoreData {
  items: Record<string, Item>;
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
