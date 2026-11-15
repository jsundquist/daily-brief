import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BriefStore } from "../src/briefs-db.ts";
import type { Brief, BriefEntry } from "../src/summary.ts";

function entry(n: number): BriefEntry {
  return { title: `Title ${n}`, link: `https://example.com/${n}`, source: "S", reason: "r", score: 4 };
}

function brief(date: string, ...numbers: number[]): Brief {
  return {
    date,
    summary: `Summary for ${date}`,
    care: [{ topic: "Security", entries: numbers.map(entry) }],
    maybe: [],
    trends: [],
    considered: 10,
    failedBatches: 0,
  };
}

function tempDb(): string {
  return join(mkdtempSync(join(tmpdir(), "briefs-")), "briefs.db");
}

test("a stored brief reads back unchanged with when and by what it was made", () => {
  const store = new BriefStore(tempDb());
  store.save(brief("2026-11-15", 1, 2), "2026-11-15T12:00:00.000Z", "qwen");
  assert.deepEqual(store.get("2026-11-15"), {
    brief: brief("2026-11-15", 1, 2),
    generatedAt: "2026-11-15T12:00:00.000Z",
    model: "qwen",
  });
  assert.equal(store.get("2026-11-14"), null);
});

test("saving the same day again replaces that day's brief", () => {
  const store = new BriefStore(tempDb());
  store.save(brief("2026-11-15", 1), "2026-11-15T12:00:00.000Z", "qwen");
  store.save(brief("2026-11-15", 2), "2026-11-15T13:00:00.000Z", "qwen");
  assert.equal(store.get("2026-11-15")?.brief.care[0].entries[0].link, "https://example.com/2");
  assert.equal(store.list(10).length, 1);
});

test("latest and list are newest first", () => {
  const store = new BriefStore(tempDb());
  store.save(brief("2026-11-13", 1), "2026-11-13T12:00:00.000Z", "qwen");
  store.save(brief("2026-11-15", 2), "2026-11-15T12:00:00.000Z", "qwen");
  store.save(brief("2026-11-14", 3), "2026-11-14T12:00:00.000Z", "qwen");
  assert.equal(store.latest()?.brief.date, "2026-11-15");
  assert.deepEqual(store.list(2).map((row) => row.date), ["2026-11-15", "2026-11-14"]);
});

test("latest is null when nothing is stored", () => {
  assert.equal(new BriefStore(tempDb()).latest(), null);
});

test("links in a brief count as briefed, whichever section they were in", () => {
  const store = new BriefStore(tempDb());
  const b = brief("2026-11-15", 1);
  b.maybe = [entry(2)];
  b.trends = [{ story: "x", entries: [entry(3)] }];
  store.save(b, "2026-11-15T12:00:00.000Z", "qwen");
  assert.deepEqual([...store.briefedLinks()].sort(), ["https://example.com/1", "https://example.com/2", "https://example.com/3"]);
});

test("the other links of a merged story count as briefed too", () => {
  const store = new BriefStore(tempDb());
  const b = brief("2026-11-15");
  b.care = [{ topic: "Security", entries: [{ ...entry(1), alsoLinks: ["https://other.example/1"] }] }];
  store.save(b, "2026-11-15T12:00:00.000Z", "qwen");
  assert.deepEqual([...store.briefedLinks()].sort(), ["https://example.com/1", "https://other.example/1"]);
});

test("a day's own links are not excluded when it is regenerated", () => {
  const store = new BriefStore(tempDb());
  store.save(brief("2026-11-14", 1), "2026-11-14T12:00:00.000Z", "qwen");
  store.save(brief("2026-11-15", 2), "2026-11-15T12:00:00.000Z", "qwen");
  assert.deepEqual([...store.briefedLinks("2026-11-15")], ["https://example.com/1"]);
});

test("replacing a day frees the links the old version held", () => {
  const store = new BriefStore(tempDb());
  store.save(brief("2026-11-15", 1), "2026-11-15T12:00:00.000Z", "qwen");
  store.save(brief("2026-11-15", 2), "2026-11-15T13:00:00.000Z", "qwen");
  assert.deepEqual([...store.briefedLinks()], ["https://example.com/2"]);
});

test("the database survives being reopened", () => {
  const file = tempDb();
  new BriefStore(file).save(brief("2026-11-15", 1), "2026-11-15T12:00:00.000Z", "qwen");
  assert.equal(new BriefStore(file).latest()?.brief.date, "2026-11-15");
});

test("every scored item is kept for the day, including the ones left out of the brief", () => {
  const store = new BriefStore(tempDb());
  const b = brief("2026-11-15", 1);
  b.scored = [
    { title: "Title 1", link: "https://example.com/1", source: "S", score: 4 },
    { title: "Skipped", link: "https://example.com/9", source: "T", score: 1 },
    { title: "Mid", link: "https://example.com/5", source: "T", score: 3 },
  ];
  store.save(b, "2026-11-15T12:00:00.000Z", "qwen");
  assert.deepEqual(store.scores("2026-11-15").map((item) => item.score), [4, 3, 1]);
  assert.equal(store.scores("2026-11-14").length, 0);
});

test("scores are kept apart from the stored brief and replaced when the day is regenerated", () => {
  const store = new BriefStore(tempDb());
  const first = brief("2026-11-15", 1);
  first.scored = [{ title: "Old", link: "https://example.com/old", source: "S", score: 2 }];
  store.save(first, "2026-11-15T12:00:00.000Z", "qwen");
  assert.equal(store.get("2026-11-15")?.brief.scored, undefined);
  const second = brief("2026-11-15", 2);
  second.scored = [{ title: "New", link: "https://example.com/new", source: "S", score: 5 }];
  store.save(second, "2026-11-15T13:00:00.000Z", "qwen");
  assert.deepEqual(store.scores("2026-11-15").map((item) => item.title), ["New"]);
});
