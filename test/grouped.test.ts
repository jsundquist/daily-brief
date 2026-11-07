import { test } from "node:test";
import assert from "node:assert/strict";
import { startReady, serveFixture, tempStore } from "./helpers.ts";

const NOW = new Date("2026-11-07T12:00:00Z");

test("Atom feeds, including the YouTube channel feed, are parsed like RSS", async () => {
  const feed = await serveFixture("test/fixtures/youtube.xml");
  const sources = [{ name: "CNCF", type: "youtube" as const, url: feed.url }];
  const server = await startReady({ sources, dataFile: tempStore(), port: 0, now: () => NOW });
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
  // Old Video is outside the window but is among the source's latest three.
  assert.match(html, /Old Video/);
});

test("a source with a cap shows only its top items; uncapped sources show everything", async () => {
  const many = await serveFixture("test/fixtures/hn-many.xml");
  const uncapped = await serveFixture("test/fixtures/letter-many.xml");
  const sources = [
    { name: "Capped", type: "news" as const, url: many.url, cap: 10 },
    { name: "Uncapped", type: "newsletter" as const, url: uncapped.url },
  ];
  const server = await startReady({ sources, dataFile: tempStore(), port: 0, now: () => NOW });
  const html = await (await fetch(server.url)).text().finally(async () => {
    await server.close();
    await many.close();
    await uncapped.close();
  });
  const parts = html.split("<h2>News sites</h2>");
  assert.equal(parts.length, 2, "News sites heading must appear exactly once");
  const [newsletters, news] = parts;
  assert.equal(news.match(/<li>/g)?.length, 10);
  assert.match(news, /Story 10/);
  assert.doesNotMatch(news, /Story 11/);
  assert.equal(newsletters.match(/<li>/g)?.length, 12);
});

test("page groups by type, then source, then day newest first, within a 3-day window plus the latest three", async () => {
  const pod = await serveFixture("test/fixtures/podcast.xml");
  const letter = await serveFixture("test/fixtures/letter.xml");
  const sources = [
    { name: "Some Letter", type: "newsletter" as const, url: letter.url },
    { name: "Some Pod", type: "podcast" as const, url: pod.url },
  ];
  const server = await startReady({ sources, dataFile: tempStore(), port: 0, now: () => NOW });
  const html = await (await fetch(server.url)).text().finally(async () => {
    await server.close();
    await pod.close();
    await letter.close();
  });

  assert.match(html, /Pod Today/);
  assert.match(html, /Podcast blurb today/);
  assert.match(html, /href="https:\/\/example\.com\/pod-today"/);
  // Ancient is outside the window but is among the latest three; Older is not.
  assert.match(html, /Pod Ancient/);
  assert.doesNotMatch(html, /Pod Older/);

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
