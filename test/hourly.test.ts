import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/server.ts";

const T0 = new Date("2026-11-07T12:00:00Z");
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** A fixture feed whose body the test can swap between fetches; counts requests. */
async function serveSwappable(path: string) {
  const state = { body: readFileSync(path), hits: 0 };
  const server: Server = createServer((_req, res) => {
    state.hits += 1;
    res.writeHead(200, { "content-type": "application/rss+xml" });
    res.end(state.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    state,
    url: `http://127.0.0.1:${port}/feed.xml`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function until(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("condition not met in time");
}

async function setup(cap?: number, fixture = "test/fixtures/hn.xml") {
  const feed = await serveSwappable(fixture);
  let clock = T0;
  const server = await startServer({
    sources: [{ name: "Feed", type: "news" as const, url: feed.url, cap }],
    dataFile: join(mkdtempSync(join(tmpdir(), "brief-")), "store.json"),
    port: 0,
    now: () => clock,
    tickMs: 5,
  });
  return {
    feed,
    server,
    page: async () => (await fetch(server.url)).text(),
    setClock: (d: Date) => {
      clock = d;
    },
    close: async () => {
      await server.close();
      await feed.close();
    },
  };
}

test("feeds are re-fetched once the clock passes an hour, not before", async () => {
  const t = await setup();
  try {
    assert.equal(t.feed.state.hits, 1);
    t.setClock(new Date(T0.getTime() + 59 * MIN));
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(t.feed.state.hits, 1);
    t.setClock(new Date(T0.getTime() + HOUR));
    await until(() => t.feed.state.hits === 2);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(t.feed.state.hits, 2);
  } finally {
    await t.close();
  }
});

test("a long gap (Mac asleep) is caught up with a single immediate refresh", async () => {
  const t = await setup();
  try {
    t.setClock(new Date(T0.getTime() + 7 * HOUR + 20 * MIN));
    await until(() => t.feed.state.hits === 2);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(t.feed.state.hits, 2);
    t.setClock(new Date(T0.getTime() + 8 * HOUR + 20 * MIN));
    await until(() => t.feed.state.hits === 3);
  } finally {
    await t.close();
  }
});

test("a capped source is replaced by the newly fetched capped set, never exceeding its cap", async () => {
  const t = await setup(10, "test/fixtures/hn-many.xml");
  try {
    t.feed.state.body = Buffer.from(
      readFileSync("test/fixtures/hn-many.xml", "utf8").replaceAll("story-", "fresh-").replaceAll("Story ", "Fresh "),
    );
    t.setClock(new Date(T0.getTime() + HOUR));
    await until(() => t.feed.state.hits === 2);
    await new Promise((resolve) => setTimeout(resolve, 60));
    const html = await t.page();
    assert.equal((html.match(/<li>/g) ?? []).length, 10);
    assert.doesNotMatch(html, /example\.com\/story-/);
    assert.match(html, /example\.com\/fresh-1"/);
  } finally {
    await t.close();
  }
});

test("check-off state survives a scheduled refresh", async () => {
  const t = await setup();
  try {
    const link = (/data-link="([^"]+)"/.exec(await t.page()) as RegExpExecArray)[1].replaceAll("&amp;", "&");
    await fetch(`${t.server.url}toggle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ link }),
    });
    t.setClock(new Date(T0.getTime() + HOUR));
    await until(() => t.feed.state.hits === 2);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.match(await t.page(), /<div class="done" data-link=/);
  } finally {
    await t.close();
  }
});

test("/version changes when a refresh brings new items, so an open page can update itself", async () => {
  const t = await setup();
  try {
    const before = await (await fetch(`${t.server.url}version`)).text();
    assert.equal(await (await fetch(`${t.server.url}version`)).text(), before);
    t.feed.state.body = Buffer.from(
      readFileSync("test/fixtures/hn.xml", "utf8").replaceAll("</channel>", `<item><title>Brand new</title><link>https://example.com/brand-new</link><pubDate>Sat, 07 Nov 2026 12:30:00 +0000</pubDate><description>x</description></item></channel>`),
    );
    t.setClock(new Date(T0.getTime() + HOUR));
    await until(() => t.feed.state.hits === 2);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.notEqual(await (await fetch(`${t.server.url}version`)).text(), before);
    const html = await t.page();
    assert.match(html, /Brand new/);
    assert.match(html, /fetch\("\/version"\)/);
  } finally {
    await t.close();
  }
});
