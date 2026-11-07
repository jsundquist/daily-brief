import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { startReady, serveFixture, tempStore } from "./helpers.ts";

const NOW = new Date("2026-11-07T12:00:00Z");

for (const [label, content] of [
  ["unparseable JSON", "{ not json at all"],
  ["JSON of the wrong shape", '["nope"]'],
] as const) {
  test(`a corrupt store (${label}) is moved aside and the server starts empty`, async () => {
    const feed = await serveFixture("test/fixtures/hn.xml");
    const dataFile = tempStore();
    writeFileSync(dataFile, content);
    const server = await startReady({
      sources: [{ name: "HN", type: "news" as const, url: feed.url }],
      dataFile,
      port: 0,
      now: () => NOW,
    });
    try {
      assert.match(await (await fetch(server.url)).text(), /Second Story/);
      const copies = readdirSync(dirname(dataFile)).filter(
        (name) => name !== basename(dataFile) && name.startsWith(basename(dataFile)) && name.includes("corrupt"),
      );
      assert.equal(copies.length, 1);
      assert.equal(readFileSync(`${dirname(dataFile)}/${copies[0]}`, "utf8"), content);
    } finally {
      await server.close();
      await feed.close();
    }
  });
}
