import { test } from "node:test";
import assert from "node:assert/strict";
import { startReady, serveFixture, tempStore } from "./helpers.ts";

const NOW = new Date("2026-11-07T12:00:00Z");

async function toggle(serverUrl: string, link: string): Promise<void> {
  const response = await fetch(`${serverUrl}toggle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ link }),
  });
  assert.equal(response.status, 204);
}

/** The opening item tag for the item with this link. */
async function itemTag(serverUrl: string, link: string): Promise<string> {
  const html = await (await fetch(serverUrl)).text();
  const match = html.match(/<div[^>]*>/g)?.find((tag) => tag.includes(`data-link="${link}"`));
  assert.ok(match, `item ${link} not on page`);
  return match;
}

const ONE = "https://example.com/one";
const TWO = "https://example.com/two";

test("clicking an item strikes it through and clicking again undoes it", async () => {
  const feed = await serveFixture("test/fixtures/hn.xml");
  const sources = [{ name: "HN", type: "news" as const, url: feed.url }];
  const server = await startReady({ sources, dataFile: tempStore(), port: 0, now: () => NOW });
  try {
    assert.doesNotMatch(await itemTag(server.url, ONE), /class="done"/);
    await toggle(server.url, ONE);
    assert.match(await itemTag(server.url, ONE), /class="done"/);
    assert.doesNotMatch(await itemTag(server.url, TWO), /class="done"/);
    await toggle(server.url, ONE);
    assert.doesNotMatch(await itemTag(server.url, ONE), /class="done"/);
  } finally {
    await server.close();
    await feed.close();
  }
});

test("struck-through state survives a server restart and a re-fetch of the same link", async () => {
  const feed = await serveFixture("test/fixtures/hn.xml");
  const sources = [{ name: "HN", type: "news" as const, url: feed.url }];
  const dataFile = tempStore();
  const first = await startReady({ sources, dataFile, port: 0, now: () => NOW });
  await toggle(first.url, ONE);
  await first.close();
  // Restart: the server fetches the feed again on startup, re-storing the same links.
  const second = await startReady({ sources, dataFile, port: 0, now: () => NOW });
  try {
    assert.match(await itemTag(second.url, ONE), /class="done"/);
    assert.doesNotMatch(await itemTag(second.url, TWO), /class="done"/);
  } finally {
    await second.close();
    await feed.close();
  }
});
