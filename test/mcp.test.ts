import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BriefStore } from "../src/briefs-db.ts";
import { createBriefMcpServer } from "../src/mcp.ts";
import type { Brief } from "../src/summary.ts";

function brief(date: string): Brief {
  return {
    date,
    summary: `Summary for ${date}`,
    care: [{ topic: "Security", entries: [{ title: "Worm", link: "https://example.com/worm", source: "Feed", reason: "hits npm", score: 5 }] }],
    maybe: [{ title: "Odd", link: "https://example.com/odd", source: "Feed", reason: "unsure", score: 3 }],
    trends: [],
    considered: 12,
    failedBatches: 0,
  };
}

async function connect(briefs: BriefStore): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createBriefMcpServer(briefs).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<string> {
  const result = (await client.callTool({ name, arguments: args })) as { content: Array<{ type: string; text: string }> };
  return result.content[0].text;
}

function tempBriefs(): BriefStore {
  return new BriefStore(join(mkdtempSync(join(tmpdir(), "mcp-")), "briefs.db"));
}

test("get_brief returns the latest brief as Markdown with real links", async () => {
  const briefs = tempBriefs();
  briefs.save(brief("2026-11-14"), "2026-11-14T12:00:00.000Z", "qwen");
  briefs.save(brief("2026-11-15"), "2026-11-15T12:00:00.000Z", "qwen");
  const text = await call(await connect(briefs), "get_brief");
  assert.match(text, /# Daily brief for 2026-11-15/);
  assert.match(text, /Summary for 2026-11-15/);
  assert.match(text, /### Security/);
  assert.match(text, /\[Worm\]\(https:\/\/example.com\/worm\) \(Feed, 5\/5\): hits npm/);
  assert.match(text, /## Maybe of interest/);
});

test("get_brief leads with the linked points when the brief has them", async () => {
  const briefs = tempBriefs();
  const withPoints = { ...brief("2026-11-15"), summaryPoints: [{ headline: "The worm", why: "Patch it.", links: [{ title: "Worm", link: "https://example.com/worm", source: "Feed" }] }] };
  briefs.save(withPoints, "2026-11-15T12:00:00.000Z", "qwen");
  const text = await call(await connect(briefs), "get_brief");
  assert.match(text, /## Read these first\n\n- \*\*\[The worm\]\(https:\/\/example.com\/worm\)\*\* \(Feed\): Patch it\./);
  assert.doesNotMatch(text, /Summary for 2026-11-15/);
});

test("get_brief takes a date", async () => {
  const briefs = tempBriefs();
  briefs.save(brief("2026-11-14"), "2026-11-14T12:00:00.000Z", "qwen");
  briefs.save(brief("2026-11-15"), "2026-11-15T12:00:00.000Z", "qwen");
  const client = await connect(briefs);
  assert.match(await call(client, "get_brief", { date: "2026-11-14" }), /Summary for 2026-11-14/);
  assert.equal(await call(client, "get_brief", { date: "2026-01-01" }), "No brief for 2026-01-01.");
});

test("get_brief says so when nothing has been generated", async () => {
  assert.match(await call(await connect(tempBriefs()), "get_brief"), /No brief has been generated yet/);
});

test("list_briefs lists newest first", async () => {
  const briefs = tempBriefs();
  briefs.save(brief("2026-11-14"), "2026-11-14T12:00:00.000Z", "qwen");
  briefs.save(brief("2026-11-15"), "2026-11-15T12:00:00.000Z", "qwen");
  const lines = (await call(await connect(briefs), "list_briefs")).split("\n");
  assert.match(lines[0], /^2026-11-15: 12 items/);
  assert.match(lines[1], /^2026-11-14/);
});
