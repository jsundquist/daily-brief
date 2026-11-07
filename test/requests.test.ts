import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { request } from "node:http";
import { startReady, serveFixture, tempStore } from "./helpers.ts";

const NOW = new Date("2026-11-07T12:00:00Z");
const ONE = "https://example.com/one";

async function setup() {
  const feed = await serveFixture("test/fixtures/hn.xml");
  const server = await startReady({
    sources: [{ name: "HN", type: "news" as const, url: feed.url }],
    dataFile: tempStore(),
    port: 0,
    now: () => NOW,
  });
  const origin = server.url.replace(/\/$/, "");
  const post = (path: string, init: { headers?: Record<string, string>; body?: string }) =>
    fetch(`${server.url}${path}`, { method: "POST", ...init });
  const toggle = (link: string, headers: Record<string, string> = {}) =>
    post("toggle", { headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ link }) });
  const isDone = async () => /<div class="done" data-link="https:\/\/example\.com\/one"/.test(await (await fetch(server.url)).text());
  return {
    feed,
    server,
    origin,
    post,
    toggle,
    isDone,
    close: async () => {
      await server.close();
      await feed.close();
    },
  };
}

test("a same-origin toggle works, as does a request with no Origin header", async () => {
  const t = await setup();
  try {
    assert.equal((await t.toggle(ONE, { origin: t.origin })).status, 204);
    assert.equal(await t.isDone(), true);
    assert.equal((await t.toggle(ONE)).status, 204);
    assert.equal(await t.isDone(), false);
  } finally {
    await t.close();
  }
});

test("cross-origin toggle and refresh requests are rejected and change nothing", async () => {
  const t = await setup();
  try {
    const hitsBefore = t.feed.state.hits;
    assert.equal((await t.toggle(ONE, { origin: "https://evil.example" })).status, 403);
    assert.equal(await t.isDone(), false);
    assert.equal((await t.post("refresh", { headers: { origin: "https://evil.example" } })).status, 403);
    assert.equal(t.feed.state.hits, hitsBefore);
  } finally {
    await t.close();
  }
});

test("a request addressed to a foreign Host (DNS rebinding) is rejected", async () => {
  const t = await setup();
  try {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        `${t.server.url}toggle`,
        { method: "POST", headers: { host: "evil.example", "content-type": "application/json" } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end(JSON.stringify({ link: ONE }));
    });
    assert.equal(status, 403);
    assert.equal(await t.isDone(), false);
  } finally {
    await t.close();
  }
});

test("toggle requires a JSON content type", async () => {
  const t = await setup();
  try {
    const response = await t.post("toggle", {
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ link: ONE }),
    });
    assert.equal(response.status, 415);
    assert.equal(await t.isDone(), false);
  } finally {
    await t.close();
  }
});

test("an oversized toggle body is rejected", async () => {
  const t = await setup();
  try {
    const response = await t.post("toggle", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ link: "https://example.com/" + "x".repeat(200_000) }),
    });
    assert.equal(response.status, 413);
  } finally {
    await t.close();
  }
});

test("toggling a link the store does not know is ignored, not remembered", async () => {
  const t = await setup();
  try {
    const unknown = "https://example.com/not-yet";
    assert.equal((await t.toggle(unknown)).status, 204);
    t.feed.state.body = Buffer.from(
      readFileSync("test/fixtures/hn.xml", "utf8").replaceAll(
        "</channel>",
        `<item><title>Later Arrival</title><link>${unknown}</link><pubDate>Fri, 06 Nov 2026 11:00:00 +0000</pubDate><description>x</description></item></channel>`,
      ),
    );
    await t.post("refresh", {});
    const html = await (await fetch(t.server.url)).text();
    assert.match(html, /Later Arrival/);
    assert.doesNotMatch(html, /<div class="done" data-link="https:\/\/example\.com\/not-yet"/);
  } finally {
    await t.close();
  }
});
