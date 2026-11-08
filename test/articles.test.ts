import { test } from "node:test";
import assert from "node:assert/strict";
import { startReady, serveFeed, tempStore } from "./helpers.ts";

const NOW = new Date("2026-11-07T12:00:00Z");

function table(title: string, href: string, blurb: string, sponsor = false): string {
  const tag = sponsor ? ' <span style="text-transform: uppercase;">sponsor</span>' : "";
  return `<table><tr><td><p><span style="font-weight: 500; font-size: 18px;"><a href="${href}" title="x.dev">${title}</a></span> — ${blurb}</p>${tag}</td></tr></table>`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

test("a Cooperpress newsletter issue shows its articles, not the issue, and skips sponsors", async () => {
  const html = [
    table("First Story", "https://example.com/first", "Blurb one &amp; more"),
    table("Paid Story", "https://example.com/paid", "Buy now", true),
    table("Second Story", "https://example.com/second", "Blurb two"),
  ].join("");
  const feed = await serveFeed(
    `<?xml version="1.0"?><rss version="2.0"><channel><title>w</title><item><title>Issue 646</title><link>https://example.com/issues/646</link><pubDate>Fri, 06 Nov 2026 10:00:00 +0000</pubDate><description>${escapeXml(html)}</description></item></channel></rss>`,
  );
  const server = await startReady({
    sources: [{ name: "Weekly", type: "newsletter" as const, url: feed.url, articles: "cooperpress" as const }],
    dataFile: tempStore(),
    port: 0,
    now: () => NOW,
  });
  const page = await (await fetch(server.url)).text().finally(async () => {
    await server.close();
    await feed.close();
  });
  assert.match(page, /href="https:\/\/example\.com\/first"[^>]*>First Story<\/a>/);
  assert.match(page, /Blurb one &amp;amp; more|Blurb one &amp; more/);
  assert.match(page, /Second Story/);
  assert.doesNotMatch(page, /Paid Story/);
  assert.doesNotMatch(page, /Issue 646/);
});

test("a TLDR issue is fetched from its page and shown as its articles, without sponsors or tracking", async () => {
  const issuePage = await serveFeed(
    `<html><body>
<article class="mt-3"><a href="https://ads.example.com/x?utm_source=tldr" target="_blank"><h3>Buy things (Sponsor)</h3></a><div class="newsletter-html">ad</div></article>
<article class="mt-3"><a class="font-bold" href="https://example.com/story?id=1&amp;amp;utm_source=tldrdev&amp;amp;utm_medium=newsletter" target="_blank"><h3>Real Story (5 minute read)</h3></a><div class="newsletter-html">It&#x27;s <b>good</b>.<p></p><p>Really.</p></div></article>
</body></html>`,
  );
  const feed = await serveFeed(
    `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><item><title>Headlines</title><link>${issuePage.url}</link><pubDate>Fri, 06 Nov 2026 00:00:00 GMT</pubDate></item></channel></rss>`,
  );
  const server = await startReady({
    sources: [{ name: "TLDR Test", type: "newsletter" as const, url: feed.url, articles: "tldr" as const }],
    dataFile: tempStore(),
    port: 0,
    now: () => NOW,
  });
  const page = await (await fetch(server.url)).text().finally(async () => {
    await server.close();
    await feed.close();
    await issuePage.close();
  });
  assert.match(page, /href="https:\/\/example\.com\/story\?id=1"[^>]*>Real Story \(5 minute read\)<\/a>/);
  assert.match(page, /It&#39;s good\. Really\.|It's good\. Really\./);
  assert.doesNotMatch(page, /Buy things/);
  assert.doesNotMatch(page, /Headlines/);
});
