import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Brief, ScoredItem } from "./summary.ts";

export interface StoredBrief {
  brief: Brief;
  generatedAt: string;
  model: string;
}

/** One brief per day, plus which links each day's brief already showed. */
export class BriefStore {
  private db: DatabaseSync;

  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS briefs (
        date TEXT PRIMARY KEY,
        generated_at TEXT NOT NULL,
        model TEXT NOT NULL,
        brief TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS briefed (
        link TEXT NOT NULL,
        date TEXT NOT NULL,
        PRIMARY KEY (link, date)
      );
      CREATE TABLE IF NOT EXISTS item_scores (
        date TEXT NOT NULL,
        link TEXT NOT NULL,
        title TEXT NOT NULL,
        source TEXT NOT NULL,
        score INTEGER NOT NULL,
        PRIMARY KEY (date, link)
      );
    `);
  }

  /** Store a day's brief, replacing any earlier one for the same day. */
  save(brief: Brief, generatedAt: string, model: string): void {
    const links = [...brief.care.flatMap((group) => group.entries), ...brief.maybe, ...brief.trends.flatMap((trend) => trend.entries)].flatMap(
      (entry) => [entry.link, ...(entry.alsoLinks ?? [])],
    );
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM briefed WHERE date = ?").run(brief.date);
      this.db.prepare("DELETE FROM item_scores WHERE date = ?").run(brief.date);
      const { scored, ...stored } = brief;
      this.db
        .prepare("INSERT OR REPLACE INTO briefs (date, generated_at, model, brief) VALUES (?, ?, ?, ?)")
        .run(brief.date, generatedAt, model, JSON.stringify(stored));
      const insertScore = this.db.prepare("INSERT OR REPLACE INTO item_scores (date, link, title, source, score) VALUES (?, ?, ?, ?, ?)");
      for (const item of scored ?? []) {
        insertScore.run(brief.date, item.link, item.title, item.source, item.score);
      }
      const insert = this.db.prepare("INSERT OR IGNORE INTO briefed (link, date) VALUES (?, ?)");
      for (const link of links) {
        insert.run(link, brief.date);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  get(date: string): StoredBrief | null {
    return this.toStored(this.db.prepare("SELECT * FROM briefs WHERE date = ?").get(date));
  }

  latest(): StoredBrief | null {
    return this.toStored(this.db.prepare("SELECT * FROM briefs ORDER BY date DESC LIMIT 1").get());
  }

  /** Newest first. */
  list(limit: number): Array<{ date: string; generatedAt: string; model: string; considered: number }> {
    return this.db
      .prepare("SELECT date, generated_at, model, brief FROM briefs ORDER BY date DESC LIMIT ?")
      .all(limit)
      .map((row) => ({
        date: row.date as string,
        generatedAt: row.generated_at as string,
        model: row.model as string,
        considered: (JSON.parse(row.brief as string) as Brief).considered,
      }));
  }

  /** Every item the model scored for that day, best first. Empty for a day stored before scores were kept. */
  scores(date: string): ScoredItem[] {
    return this.db
      .prepare("SELECT title, link, source, score FROM item_scores WHERE date = ? ORDER BY score DESC, source, title")
      .all(date)
      .map((row) => ({ title: row.title as string, link: row.link as string, source: row.source as string, score: row.score as number }));
  }

  /** Links shown in earlier briefs. Pass a date to leave out that day's own links, for regenerating it. */
  briefedLinks(exceptDate?: string): Set<string> {
    const rows = this.db.prepare("SELECT link FROM briefed WHERE date IS NOT ?").all(exceptDate ?? null);
    return new Set(rows.map((row) => row.link as string));
  }

  close(): void {
    this.db.close();
  }

  private toStored(row: Record<string, unknown> | undefined): StoredBrief | null {
    if (row === undefined) {
      return null;
    }
    return { brief: JSON.parse(row.brief as string) as Brief, generatedAt: row.generated_at as string, model: row.model as string };
  }
}
