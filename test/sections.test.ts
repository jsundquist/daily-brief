import { test } from "node:test";
import assert from "node:assert/strict";
import { startReady, serveFeed, serveFixture, tempStore } from "./helpers.ts";

const NOW = new Date("2026-11-07T12:00:00Z");

function sectionOf(html: string, name: string): string {
  const start = html.indexOf(`<h3>${name}</h3>`);
  assert.notEqual(start, -1, `section ${name} missing`);
  return html.slice(start, html.indexOf("</section>", start));
}

test("every configured source shows its section and Updated line, even with no items", async () => {
  const old = await serveFixture("test/fixtures/podcast.xml");
  const empty = await serveFeed('<?xml version="1.0"?><rss version="2.0"><channel><title>e</title></channel></rss>');
  const withItems = await serveFixture("test/fixtures/letter.xml");
  const never = await serveFixture("test/fixtures/hn.xml");
  never.state.hang = true;
  const server = await startReady({
    sources: [
      { name: "Zed Empty", type: "podcast" as const, url: empty.url },
      { name: "Alpha Letter", type: "newsletter" as const, url: withItems.url },
      { name: "Hung News", type: "news" as const, url: never.url },
      { name: "Aaa Pod", type: "podcast" as const, url: old.url },
    ],
    dataFile: tempStore(),
    port: 0,
    now: () => new Date(NOW.getTime() + 10 * 24 * 60 * 60 * 1000),
    fetchTimeoutMs: 200,
  });
  try {
    const html = await (await fetch(server.url)).text();
    assert.match(sectionOf(html, "Zed Empty"), /Updated 2026-11-17 12:00 UTC/);
    assert.match(sectionOf(html, "Aaa Pod"), /Updated 2026-11-17 12:00 UTC/);
    assert.match(sectionOf(html, "Aaa Pod"), /Pod Ancient/);
    assert.doesNotMatch(sectionOf(html, "Zed Empty"), /<li>/);
    assert.match(sectionOf(html, "Hung News"), /Never updated/);
    assert.doesNotMatch(sectionOf(html, "Hung News"), /class="warning"/);
    // type order first, then configured order within a type
    const at = (needle: string) => html.indexOf(needle);
    assert.ok(at("<h2>Podcasts</h2>") < at("<h3>Zed Empty</h3>"));
    assert.ok(at("<h3>Zed Empty</h3>") < at("<h3>Aaa Pod</h3>"));
    assert.ok(at("<h3>Aaa Pod</h3>") < at("<h2>Newsletters</h2>"));
    assert.ok(at("<h2>Newsletters</h2>") < at("<h2>News sites</h2>"));
    assert.ok(at("<h2>News sites</h2>") < at("<h3>Hung News</h3>"));
  } finally {
    await server.close();
    for (const feed of [old, empty, withItems, never]) {
      await feed.close();
    }
  }
});

test("long descriptions are shortened for display at a word boundary with an ellipsis; stored text stays full", async () => {
  const words = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(" ");
  const feed = await serveFeed(
    `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><item><title>Long One</title><link>https://example.com/long</link><pubDate>Fri, 06 Nov 2026 10:00:00 +0000</pubDate><description>${words}</description></item><item><title>Short One</title><link>https://example.com/short</link><pubDate>Fri, 06 Nov 2026 09:00:00 +0000</pubDate><description>tiny text</description></item></channel></rss>`,
  );
  const dataFile = tempStore();
  const server = await startReady({
    sources: [{ name: "Letter", type: "newsletter" as const, url: feed.url }],
    dataFile,
    port: 0,
    now: () => NOW,
  });
  try {
    const html = await (await fetch(server.url)).text();
    const shown = /<p>(word0 [^<]*)<\/p>/.exec(html)?.[1] as string;
    assert.ok(shown, "long description not found");
    assert.ok(shown.length <= 305, `shown ${shown.length} chars`);
    assert.ok(shown.length >= 250, `shown only ${shown.length} chars`);
    assert.match(shown, /word\d+…$/);
    assert.match(html, /<p>tiny text<\/p>/);
    const { readFileSync } = await import("node:fs");
    assert.ok(readFileSync(dataFile, "utf8").includes("word1999"));
  } finally {
    await server.close();
    await feed.close();
  }
});
