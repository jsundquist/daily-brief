import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../src/server.ts";
import { serveFixture, tempStore, type FixtureFeed } from "./helpers.ts";

type Mode = "404" | "junk" | "hang";

function breakFeed(feed: FixtureFeed, mode: Mode): void {
  if (mode === "404") {
    feed.state.status = 404;
  } else if (mode === "junk") {
    feed.state.body = Buffer.from("<html><body>not a feed <<<");
  } else {
    feed.state.hang = true;
  }
}

const T0 = new Date("2026-11-07T12:00:00Z");
const T1 = new Date("2026-11-07T13:00:00Z");

async function setup() {
  const flaky = await serveFixture("test/fixtures/hn.xml");
  const good = await serveFixture("test/fixtures/letter.xml");
  let clock = T0;
  const server = await startServer({
    sources: [
      { name: "Flaky", type: "news" as const, url: flaky.url },
      { name: "Good", type: "newsletter" as const, url: good.url },
    ],
    dataFile: tempStore(),
    port: 0,
    now: () => clock,
    fetchTimeoutMs: 200,
  });
  const page = async () => (await fetch(server.url)).text();
  const refresh = async () => {
    await fetch(`${server.url}refresh`, { method: "POST" });
  };
  return {
    flaky,
    page,
    refresh,
    setClock: (d: Date) => {
      clock = d;
    },
    close: async () => {
      await server.close();
      await flaky.close();
      await good.close();
    },
  };
}

function sectionOf(html: string, name: string): string {
  const start = html.indexOf(`<h3>${name}</h3>`);
  assert.notEqual(start, -1, `section ${name} missing`);
  const end = html.indexOf("</section>", start);
  return html.slice(start, end);
}

for (const mode of ["404", "junk", "hang"] as const) {
  test(`a ${mode} feed keeps its last good items and leaves other sources untouched`, async () => {
    const t = await setup();
    try {
      const before = await t.page();
      assert.match(sectionOf(before, "Flaky"), /Updated 2026-11-07 12:00 UTC/);
      breakFeed(t.flaky, mode);
      t.setClock(T1);
      await t.refresh();
      const html = await t.page();
      const flaky = sectionOf(html, "Flaky");
      assert.match(flaky, /Updated 2026-11-07 12:00 UTC/);
      assert.match(flaky, /<li>/);
      assert.doesNotMatch(html, /class="warning"/);
      const good = sectionOf(html, "Good");
      assert.match(good, /Updated 2026-11-07 13:00 UTC/);
      assert.match(good, /<li>/);
    } finally {
      await t.close();
    }
  });
}

test("a source warns only after 3 consecutive failed refreshes; success clears it", async () => {
  const t = await setup();
  try {
    t.flaky.state.status = 404;
    await t.refresh();
    await t.refresh();
    assert.doesNotMatch(await t.page(), /class="warning"/);
    await t.refresh();
    const warned = await t.page();
    assert.match(sectionOf(warned, "Flaky"), /class="warning"[^>]*>[^<]*failing since 2026-11-07 12:00 UTC/);
    assert.doesNotMatch(sectionOf(warned, "Good"), /class="warning"/);
    t.flaky.state.status = 200;
    await t.refresh();
    assert.doesNotMatch(await t.page(), /class="warning"/);
  } finally {
    await t.close();
  }
});
