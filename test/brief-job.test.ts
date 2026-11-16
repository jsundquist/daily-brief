import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BriefStore } from "../src/briefs-db.ts";
import { runBriefJob } from "../src/brief-job.ts";
import type { Chat, ChatMessage } from "../src/llm.ts";
import { Store } from "../src/store.ts";
import { serveFixture } from "./helpers.ts";

const PROFILE = "## Security\n**Care about:** things.\n";
const DAY_1 = new Date("2026-11-07T12:00:00Z");
const DAY_2 = new Date("2026-11-08T12:00:00Z");

/** Picks every item in the prompt as a "care" and records the prompts it was sent. */
function pickAll(): Chat & { prompts: string[] } {
  const prompts: string[] = [];
  const chat = (async (messages: ChatMessage[]) => {
    const prompt = messages[1].content;
    prompts.push(prompt);
    if (prompt.startsWith("These are the items picked")) {
      return JSON.stringify({ points: [{ headline: "Summary", why: "Read it.", ids: [0] }] });
    }
    const ids = [...prompt.matchAll(/^\[(\d+)\] /gm)].map((match) => Number(match[1]));
    return JSON.stringify({ items: ids.map((id) => ({ id, score: 5, topic: "Security", reason: "r" })) });
  }) as unknown as Chat & { prompts: string[] };
  chat.prompts = prompts;
  return chat;
}

async function setup() {
  const feed = await serveFixture("test/fixtures/hn.xml");
  const dir = mkdtempSync(join(tmpdir(), "job-"));
  const dataFile = join(dir, "store.json");
  const briefs = new BriefStore(join(dir, "briefs.db"));
  const sources = [{ name: "Feed", type: "news" as const, url: feed.url }];
  const run = (chat: Chat, now: Date) =>
    runBriefJob({ sources, store: new Store(dataFile), briefs, chat, model: "m", profile: PROFILE, now: () => now });
  return { feed, briefs, dataFile, run, close: () => feed.close() };
}

test("refreshes the feeds, writes the brief and stores it under the local date", async () => {
  const t = await setup();
  try {
    const brief = await t.run(pickAll(), DAY_1);
    assert.equal(brief.date, "2026-11-07");
    assert.deepEqual(brief.care[0].entries.map((entry) => entry.title), ["First & Best Story", "Second Story"]);
    const stored = t.briefs.get("2026-11-07");
    assert.equal(stored?.model, "m");
    assert.equal(stored?.generatedAt, DAY_1.toISOString());
    assert.equal(t.feed.state.hits, 1);
  } finally {
    await t.close();
  }
});

test("items struck through on the page are not sent to the model", async () => {
  const t = await setup();
  try {
    await t.run(pickAll(), DAY_1);
    new Store(t.dataFile).toggleChecked("https://example.com/one");
    const chat = pickAll();
    await t.run(chat, DAY_1);
    assert.ok(!chat.prompts[0].includes("First & Best Story"));
    assert.ok(chat.prompts[0].includes("Second Story"));
  } finally {
    await t.close();
  }
});

test("items already in an earlier brief do not come back the next day", async () => {
  const t = await setup();
  try {
    await t.run(pickAll(), DAY_1);
    const chat = pickAll();
    const brief = await t.run(chat, DAY_2);
    assert.equal(brief.considered, 0);
    assert.equal(chat.prompts.length, 0);
  } finally {
    await t.close();
  }
});

test("regenerating the same day sees the same items again", async () => {
  const t = await setup();
  try {
    await t.run(pickAll(), DAY_1);
    const chat = pickAll();
    const brief = await t.run(chat, DAY_1);
    assert.equal(brief.considered, 2);
    assert.equal(t.briefs.list(10).length, 1);
  } finally {
    await t.close();
  }
});

test("when the model fails nothing is stored", async () => {
  const t = await setup();
  try {
    const chat: Chat = async () => {
      throw new Error("connection refused");
    };
    await assert.rejects(t.run(chat, DAY_1), /every batch failed/);
    assert.equal(t.briefs.latest(), null);
  } finally {
    await t.close();
  }
});
