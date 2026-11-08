import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startReady, serveFeed, tempStore } from "./helpers.ts";

const NOW = new Date("2026-11-07T22:42:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function itemXml(prefix: string, n: number, ageMs: number): string {
  const date = new Date(NOW.getTime() - ageMs).toUTCString();
  return `<item><title>${prefix} ${n}</title><link>https://example.com/${prefix}-${n}</link><pubDate>${date}</pubDate><description>d${n}</description></item>`;
}

/** An RSS feed with items titled `<prefix> <n>` published at the given ages (ms before NOW). */
function feedXml(prefix: string, agesMs: number[]): string {
  const items = agesMs.map((age, index) => itemXml(prefix, index + 1, age)).join("\n");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>\n${items}\n</channel></rss>`;
}

function titlesOnPage(html: string, prefix: string): string[] {
  return [...html.matchAll(new RegExp(`>${prefix} (\\d+)</a>`, "g"))].map((match) => `${prefix} ${match[1]}`);
}

function storedLinks(dataFile: string, source: string): string[] {
  const data = JSON.parse(readFileSync(dataFile, "utf8"));
  return Object.values<{ source: string; link: string }>(data.items)
    .filter((item) => item.source === source)
    .map((item) => item.link);
}

function checkedLinks(dataFile: string): string[] {
  return Object.keys(JSON.parse(readFileSync(dataFile, "utf8")).checked ?? {});
}

async function pageFor(body: string, name: string): Promise<string> {
  const feed = await serveFeed(body);
  const server = await startReady({
    sources: [{ name, type: "news", url: feed.url }],
    dataFile: tempStore(),
    port: 0,
    now: () => NOW,
  });
  try {
    return await (await fetch(server.url)).text();
  } finally {
    await server.close();
    await feed.close();
  }
}

test("a weekly source whose newest item is 4 days old still shows it and its previous two", async () => {
  const html = await pageFor(feedXml("Ep", [4 * DAY, 11 * DAY, 18 * DAY, 25 * DAY, 32 * DAY]), "Weekly");
  assert.deepEqual(titlesOnPage(html, "Ep"), ["Ep 1", "Ep 2", "Ep 3"]);
});

test("a daily source with 10 items in the window shows all 10 and no older ones", async () => {
  const ages = [...Array.from({ length: 10 }, (_, i) => (i + 1) * 5 * HOUR), 5 * DAY, 6 * DAY];
  const html = await pageFor(feedXml("Post", ages), "Daily");
  assert.equal(titlesOnPage(html, "Post").length, 10);
  assert.doesNotMatch(html, />Post 11</);
});

test("items matching both rules are shown once", async () => {
  const html = await pageFor(feedXml("Mix", [1 * DAY, 2 * DAY, 10 * DAY, 20 * DAY]), "Mixed");
  assert.deepEqual(titlesOnPage(html, "Mix"), ["Mix 1", "Mix 2", "Mix 3"]);
});

test("the store keeps a source's displayed items plus a buffer of its latest 20, and no more", async () => {
  const dataFile = tempStore();
  const feed = await serveFeed(feedXml("Old", Array.from({ length: 60 }, (_, i) => (5 + i) * DAY)));
  const sources = [{ name: "Backlog", type: "news" as const, url: feed.url }];
  const server = await startReady({ sources, dataFile, port: 0, now: () => NOW });
  try {
    assert.equal(storedLinks(dataFile, "Backlog").length, 20);
    assert.deepEqual(titlesOnPage(await (await fetch(server.url)).text(), "Old"), ["Old 1", "Old 2", "Old 3"]);
    // More than 20 items inside the window: none of the displayed ones may be pruned.
    feed.state.body = Buffer.from(feedXml("New", Array.from({ length: 25 }, (_, i) => (i + 1) * HOUR)));
    await fetch(`${server.url}refresh`, { method: "POST" });
    assert.equal(storedLinks(dataFile, "Backlog").filter((link) => link.includes("/New-")).length, 25);
    assert.equal(titlesOnPage(await (await fetch(server.url)).text(), "New").length, 25);
  } finally {
    await server.close();
    await feed.close();
  }
});

test("check-off survives for kept items and is discarded for pruned ones", async () => {
  const dataFile = tempStore();
  const original = feedXml("Ep", Array.from({ length: 20 }, (_, i) => (4 + i) * DAY));
  const feed = await serveFeed(original);
  const sources = [{ name: "Weekly", type: "news" as const, url: feed.url }];
  const toggle = (url: string, n: number) =>
    fetch(`${url}toggle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ link: `https://example.com/Ep-${n}` }),
    });
  const first = await startReady({ sources, dataFile, port: 0, now: () => NOW });
  await toggle(first.url, 1);
  await toggle(first.url, 20);
  await first.close();
  assert.deepEqual(checkedLinks(dataFile).sort(), ["https://example.com/Ep-1", "https://example.com/Ep-20"]);
  // A newer item arrives, pushing Ep-20 out of the buffer of 20.
  feed.state.body = Buffer.from(original.replace("<item>", `${itemXml("Ep", 0, 1 * DAY)}<item>`));
  const second = await startReady({ sources, dataFile, port: 0, now: () => NOW });
  try {
    assert.deepEqual(checkedLinks(dataFile), ["https://example.com/Ep-1"]);
    const html = await (await fetch(second.url)).text();
    assert.match(html, /class="done" data-link="https:\/\/example\.com\/Ep-1"/);
  } finally {
    await second.close();
    await feed.close();
  }
});
