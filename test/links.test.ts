import { test } from "node:test";
import assert from "node:assert/strict";
import { startReady, serveFeed, tempStore } from "./helpers.ts";

const NOW = new Date("2026-11-07T12:00:00Z");

function rss(items: { title: string; link: string }[]): string {
  const body = items
    .map(
      (item) =>
        `<item><title>${item.title}</title><link>${item.link}</link><pubDate>Fri, 06 Nov 2026 10:00:00 +0000</pubDate><description>d</description></item>`,
    )
    .join("");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${body}</channel></rss>`;
}

test("only http and https links are shown; javascript: and other schemes are dropped", async () => {
  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom Evil</title><link href="javascript:alert(3)"/><published>2026-11-06T10:00:00Z</published></entry></feed>`;
  const feed = await serveFeed(
    rss([
      { title: "Good Http", link: "http://example.com/a" },
      { title: "Good Https", link: "https://example.com/b" },
      { title: "Evil Script", link: "javascript:alert(1)" },
      { title: "Evil Mixed", link: "  JaVaScRiPt:alert(2)" },
      { title: "Evil Data", link: "data:text/html,hi" },
      { title: "Evil Mail", link: "mailto:a@b.c" },
    ]),
  );
  const atomFeed = await serveFeed(atom);
  const server = await startReady({
    sources: [
      { name: "RSS", type: "news" as const, url: feed.url },
      { name: "ATOM", type: "youtube" as const, url: atomFeed.url },
    ],
    dataFile: tempStore(),
    port: 0,
    now: () => NOW,
  });
  try {
    const html = await (await fetch(server.url)).text();
    assert.match(html, /Good Http/);
    assert.match(html, /Good Https/);
    assert.doesNotMatch(html, /Evil/);
    assert.doesNotMatch(html, /javascript:/i);
    assert.doesNotMatch(html, /data:text/);
    assert.doesNotMatch(html, /mailto:/);
  } finally {
    await server.close();
    await feed.close();
    await atomFeed.close();
  }
});

test("two sources sharing a link each keep their own item; check-off applies to both by link", async () => {
  const shared = "https://example.com/shared";
  const a = await serveFeed(rss([{ title: "Shared From A", link: shared }]));
  const b = await serveFeed(rss([{ title: "Shared From B", link: shared }]));
  const sources = [
    { name: "Source A", type: "news" as const, url: a.url },
    { name: "Source B", type: "newsletter" as const, url: b.url },
  ];
  const server = await startReady({ sources, dataFile: tempStore(), port: 0, now: () => NOW });
  try {
    const html = await (await fetch(server.url)).text();
    assert.match(html, /Shared From A/);
    assert.match(html, /Shared From B/);
    await fetch(`${server.url}toggle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ link: shared }),
    });
    const after = await (await fetch(server.url)).text();
    assert.equal(after.match(/<div class="done"/g)?.length, 2);
  } finally {
    await server.close();
    await a.close();
    await b.close();
  }
});
