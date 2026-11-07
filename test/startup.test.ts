import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../src/server.ts";
import { serveFixture, tempStore } from "./helpers.ts";

const NOW = new Date("2026-11-07T12:00:00Z");

test("the page is served immediately even while the first refresh is still waiting on a slow feed", async () => {
  const slow = await serveFixture("test/fixtures/hn.xml");
  slow.state.hang = true;
  const began = Date.now();
  const server = await startServer({
    sources: [{ name: "Slow", type: "news" as const, url: slow.url }],
    dataFile: tempStore(),
    port: 0,
    now: () => NOW,
    fetchTimeoutMs: 1500,
  });
  try {
    const response = await fetch(server.url);
    assert.equal(response.status, 200);
    assert.ok(Date.now() - began < 1000, "startup waited for the slow feed");
  } finally {
    await server.close();
    await slow.close();
  }
});

test("feeds are fetched concurrently, so slow feeds do not delay the rest", async () => {
  const slow = [];
  for (let i = 0; i < 4; i += 1) {
    const feed = await serveFixture("test/fixtures/hn.xml");
    feed.state.hang = true;
    slow.push(feed);
  }
  const good = await serveFixture("test/fixtures/letter.xml");
  const server = await startServer({
    sources: [
      ...slow.map((feed, i) => ({ name: `Slow ${i}`, type: "news" as const, url: feed.url })),
      { name: "Good", type: "newsletter" as const, url: good.url },
    ],
    dataFile: tempStore(),
    port: 0,
    now: () => NOW,
    fetchTimeoutMs: 400,
  });
  try {
    const began = Date.now();
    await server.firstRefresh;
    // Sequential would take 4 x 400ms; concurrent takes about one timeout.
    assert.ok(Date.now() - began < 1000, `refresh took ${Date.now() - began}ms`);
    assert.match(await (await fetch(server.url)).text(), /Letter Issue/);
  } finally {
    await server.close();
    for (const feed of slow) {
      await feed.close();
    }
    await good.close();
  }
});
