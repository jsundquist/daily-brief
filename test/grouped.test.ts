import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../src/server.ts";
import { serveFixture } from "./helpers.ts";

const NOW = new Date("2026-11-07T12:00:00Z");

function tempStore(): string {
  return join(mkdtempSync(join(tmpdir(), "brief-")), "store.json");
}

test("Atom feeds, including the YouTube channel feed, are parsed like RSS", async () => {
  const feed = await serveFixture("test/fixtures/youtube.xml");
  const sources = [{ name: "CNCF", type: "youtube" as const, url: feed.url }];
  const server = await startServer({ sources, dataFile: tempStore(), port: 0, now: () => NOW });
  const html = await (await fetch(server.url)).text().finally(async () => {
    await server.close();
    await feed.close();
  });
  assert.match(html, /YouTube/);
  assert.match(html, /Keynote: Kubernetes &amp; You/);
  assert.match(html, /href="https:\/\/www\.youtube\.com\/watch\?v=abc123"/);
  assert.match(html, /Video description text/);
  assert.match(html, /Plain Atom Entry/);
  assert.match(html, /Atom summary text/);
  assert.match(html, /href="https:\/\/example\.com\/plain"/);
  assert.doesNotMatch(html, /Old Video/);
});

test("a source with a cap shows only its top items; uncapped sources show everything", async () => {
  const many = await serveFixture("test/fixtures/hn-many.xml");
  const uncapped = await serveFixture("test/fixtures/letter-many.xml");
  const sources = [
    { name: "Capped", type: "news" as const, url: many.url, cap: 10 },
    { name: "Uncapped", type: "newsletter" as const, url: uncapped.url },
  ];
  const server = await startServer({ sources, dataFile: tempStore(), port: 0, now: () => NOW });
  const html = await (await fetch(server.url)).text().finally(async () => {
    await server.close();
    await many.close();
    await uncapped.close();
  });
  const [newsletters, news] = html.split("<h2>News sites</h2>").length === 2 ? html.split("<h2>News sites</h2>") : ["", ""];
  assert.equal(news.match(/<li>/g)?.length, 10);
  assert.match(news, /Story 10/);
  assert.doesNotMatch(news, /Story 11/);
  assert.equal(newsletters.match(/<li>/g)?.length, 12);
});

test("page groups by type, then source, then day newest first, within a 3-day window", async () => {
  const pod = await serveFixture("test/fixtures/podcast.xml");
  const letter = await serveFixture("test/fixtures/letter.xml");
  const sources = [
    { name: "Some Letter", type: "newsletter" as const, url: letter.url },
    { name: "Some Pod", type: "podcast" as const, url: pod.url },
  ];
  const server = await startServer({ sources, dataFile: tempStore(), port: 0, now: () => NOW });
  const html = await (await fetch(server.url)).text().finally(async () => {
    await server.close();
    await pod.close();
    await letter.close();
  });

  assert.match(html, /Pod Today/);
  assert.match(html, /Podcast blurb today/);
  assert.match(html, /href="https:\/\/example\.com\/pod-today"/);
  assert.doesNotMatch(html, /Pod Ancient/);

  const at = (needle: string): number => {
    const index = html.indexOf(needle);
    assert.ok(index >= 0, `missing ${needle}`);
    return index;
  };
  // podcasts before newsletters, regardless of config order
  assert.ok(at("Podcasts") < at("Newsletters"));
  assert.ok(at("Newsletters") < at("Letter Issue"));
  // newest day first within a source
  assert.ok(at("2026-11-07") < at("2026-11-06"));
  assert.ok(at("Pod Today") < at("Pod Yesterday"));
});
