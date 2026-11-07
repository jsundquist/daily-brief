import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Item } from "./feed.ts";

interface StoreData {
  items: Record<string, Item>;
  /** Links of items struck through. */
  checked?: Record<string, true>;
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
