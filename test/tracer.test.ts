import { test } from "node:test";
import assert from "node:assert/strict";
import { startReady, serveFixture, tempStore } from "./helpers.ts";

test("page lists Hacker News items fetched from the feed, and they survive a restart", async () => {
  const feed = await serveFixture("test/fixtures/hn.xml");
  const dataFile = tempStore();
  const sources = [{ name: "Hacker News", type: "news" as const, url: feed.url }];
  const now = () => new Date("2026-11-07T12:00:00Z");

  const first = await startReady({ sources, dataFile, port: 0, now });
  const html = await (await fetch(first.url)).text();
  assert.match(html, /First &amp; Best Story/);
  assert.match(html, /href="https:\/\/example\.com\/one"/);
  assert.match(html, /Second Story/);
  assert.match(html, /Comments/);
  await first.close();
  await feed.close();

  // Feed is gone; a restarted server must still show the stored items.
  const second = await startReady({ sources, dataFile, port: 0, now });
  const again = await (await fetch(second.url)).text();
  assert.match(again, /First &amp; Best Story/);
  assert.match(again, /Second Story/);
  await second.close();
});
