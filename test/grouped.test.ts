import { test } from "node:test";
import assert from "node:assert/strict";
import { startReady, serveFeed, serveFixture, tempStore } from "./helpers.ts";

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
  // podcasts show the last 4 days, as "title (producer)" with the summary under it
  assert.match(html, /Pod Yesterday/);
  assert.doesNotMatch(html, /Pod Ancient/);
  assert.doesNotMatch(html, /Pod Older/);
  assert.match(html, /<\/a> <small>\(Some Pod\)<\/small><p>Podcast blurb today<\/p>/);
  // every link opens in a new tab without opener or referrer
  for (const anchor of html.match(/<a href="http[^>]*>/g) ?? []) {
    assert.match(anchor, /target="_blank" rel="noopener noreferrer"/);
  }

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

test("podcasts older than 4 days are not shown", async () => {
  const pod = await serveFixture("test/fixtures/podcast.xml");
  const server = await startReady({
    sources: [{ name: "Some Pod", type: "podcast" as const, url: pod.url }],
    dataFile: tempStore(),
    port: 0,
    now: () => new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000),
  });
  const html = await (await fetch(server.url)).text().finally(async () => {
    await server.close();
    await pod.close();
  });
  assert.doesNotMatch(html, /Pod Today/);
  assert.doesNotMatch(html, /Pod Older/);
});

test("newsletter articles from every newsletter are listed together by day as title (source)", async () => {
  const one = await serveFixture("test/fixtures/letter.xml");
  const two = await serveFixture("test/fixtures/letter.xml");
  const server = await startReady({
    sources: [
      { name: "Letter A", type: "newsletter" as const, url: one.url },
      { name: "Letter B", type: "newsletter" as const, url: two.url },
    ],
    dataFile: tempStore(),
    port: 0,
    now: () => NOW,
  });
  const html = await (await fetch(server.url)).text().finally(async () => {
    await server.close();
    await one.close();
    await two.close();
  });
  assert.doesNotMatch(html, /<h3>Letter A<\/h3>/);
  assert.match(html, /<small>\(Letter A\)<\/small>/);
  assert.match(html, /<small>\(Letter B\)<\/small>/);
  assert.equal(html.match(/<h4>2026-11-06<\/h4>/g)?.length, 1);
});

test("daily newsletters show 4 days; weekly newsletters show only the last day they published", async () => {
  const feedXml = (items: [string, string][]): string =>
    `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items
      .map(([title, date]) => `<item><title>${title}</title><link>https://example.com/${title.replace(/ /g, "-")}</link><pubDate>${date}</pubDate><description>d</description></item>`)
      .join("")}</channel></rss>`;
  const daily = await serveFeed(feedXml([["Daily New", "Fri, 06 Nov 2026 07:00:00 +0000"], ["Daily Old", "Mon, 26 Oct 2026 07:00:00 +0000"]]));
  const weekly = await serveFeed(
    feedXml([["Weekly Latest A", "Mon, 02 Nov 2026 07:00:00 +0000"], ["Weekly Latest B", "Mon, 02 Nov 2026 06:00:00 +0000"], ["Weekly Prior", "Mon, 26 Oct 2026 07:00:00 +0000"]]),
  );
  const server = await startReady({
    sources: [
      { name: "Daily Letter", type: "newsletter" as const, url: daily.url },
      { name: "Weekly Letter", type: "newsletter" as const, url: weekly.url, cadence: "weekly" as const },
    ],
    dataFile: tempStore(),
    port: 0,
    now: () => NOW,
  });
  const html = await (await fetch(server.url)).text().finally(async () => {
    await server.close();
    await daily.close();
    await weekly.close();
  });
  assert.ok(html.indexOf("<h3>Daily</h3>") < html.indexOf("Daily New"));
  assert.ok(html.indexOf("Daily New") < html.indexOf("<h3>Weekly</h3>"));
  assert.ok(html.indexOf("<h3>Weekly</h3>") < html.indexOf("Weekly Latest A"));
  assert.match(html, /Weekly Latest B/);
  assert.doesNotMatch(html, /Daily Old/);
  assert.doesNotMatch(html, /Weekly Prior/);
});

test("/brief.json lists what the page shows, with summaries and check-off state", async () => {
  const pod = await serveFixture("test/fixtures/podcast.xml");
  const letter = await serveFixture("test/fixtures/letter.xml");
  const server = await startReady({
    sources: [
      { name: "Some Pod", type: "podcast" as const, url: pod.url },
      { name: "Some Letter", type: "newsletter" as const, url: letter.url, cadence: "weekly" as const },
    ],
    dataFile: tempStore(),
    port: 0,
    now: () => NOW,
  });
  try {
    await fetch(`${server.url}toggle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ link: "https://example.com/pod-today" }),
    });
    const response = await fetch(`${server.url}brief.json`);
    assert.match(response.headers.get("content-type") ?? "", /application\/json/);
    const brief = (await response.json()) as { generatedAt: string; items: Record<string, unknown>[] };
    const titles = brief.items.map((item) => item.title);
    assert.deepEqual(titles, ["Pod Today", "Pod Yesterday", "Letter Issue"]);
    assert.deepEqual(brief.items[0], {
      type: "podcast",
      source: "Some Pod",
      title: "Pod Today",
      link: "https://example.com/pod-today",
      published: "2026-11-07T08:00:00.000Z",
      summary: "Podcast blurb today",
      done: true,
    });
    assert.equal(brief.items[1]?.done, false);
    assert.equal(brief.items[2]?.cadence, "weekly");
  } finally {
    await server.close();
    await pod.close();
    await letter.close();
  }
});
