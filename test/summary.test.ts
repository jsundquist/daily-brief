import assert from "node:assert/strict";
import { test } from "node:test";
import type { BriefItem } from "../src/brief.ts";
import type { Chat, ChatMessage } from "../src/llm.ts";
import { generateBrief } from "../src/summary.ts";

const PROFILE = "# Interest profile\n\n## Security\n**Care about:** supply chain.\n\n## JavaScript and Node\n**Care about:** releases.\n";

function item(n: number, source = `Source ${n}`, link = `https://example.com/${n}`): BriefItem {
  return { type: "news", source, title: `Title number ${n} of the day`, link, published: "2026-11-15T05:00:00.000Z", summary: `Summary ${n}`, done: false };
}

/** A chat that answers each call from a queue of canned replies and records the prompts. */
function scripted(...replies: Array<string | Error>): Chat & { calls: number; prompts: string[] } {
  const chat = (async (messages: ChatMessage[]) => {
    chat.calls += 1;
    chat.prompts.push(messages[1].content);
    const reply = replies.shift();
    if (reply === undefined || reply instanceof Error) {
      throw reply ?? new Error("no more replies");
    }
    return reply;
  }) as unknown as Chat & { calls: number; prompts: string[] };
  chat.calls = 0;
  chat.prompts = [];
  return chat;
}

interface Scored {
  id: number;
  score: number;
  topic?: string;
  reason?: string;
}

const scores = (...items: Scored[]) => JSON.stringify({ items: items.map((i) => ({ topic: "Security", reason: "r", ...i })) });
interface Point {
  headline: string;
  why: string;
  ids: unknown[];
}

const summaryReply = (points: Point[] = [{ headline: "Big story", why: "Open it first.", ids: [0] }]) => JSON.stringify({ points });
const run = (items: BriefItem[], chat: Chat, extra: Record<string, unknown> = {}) =>
  generateBrief({ items, profile: PROFILE, chat, date: "2026-11-15", ...extra });

test("titles and links come from the data, not from the model", async () => {
  const chat = scripted(scores({ id: 0, score: 5, reason: "npm worm" }, { id: 1, score: 1, topic: undefined, reason: undefined }), summaryReply());
  const brief = await run([item(0), item(1)], chat);
  assert.deepEqual(brief.care, [
    { topic: "Security", entries: [{ title: "Title number 0 of the day", link: "https://example.com/0", source: "Source 0", reason: "npm worm", score: 5 }] },
  ]);
  assert.equal(brief.considered, 2);
  assert.equal(brief.summary, "Big story");
});

test("every score is recorded, including the ones left out, and a merged story scores under each of its links", async () => {
  const a = item(0, "TLDR Dev", "https://example.com/a?utm_source=tldr");
  const b = item(1, "TLDR AI", "https://example.com/a");
  const chat = scripted(scores({ id: 0, score: 5 }, { id: 1, score: 1, topic: undefined, reason: undefined }), summaryReply());
  const brief = await run([a, b, item(2)], chat);
  assert.deepEqual(
    brief.scored?.map(({ source, score }) => `${source}:${score}`),
    ["TLDR Dev:5", "TLDR AI:5", "Source 2:1"],
  );
});

test("scores of 4 and 5 are worth your time, 3 is maybe, and 1 or 2 are left out", async () => {
  const items = [0, 1, 2, 3, 4].map((n) => item(n));
  const chat = scripted(
    scores({ id: 0, score: 5 }, { id: 1, score: 4 }, { id: 2, score: 3 }, { id: 3, score: 2 }, { id: 4, score: 1 }),
    summaryReply(),
  );
  const brief = await run(items, chat);
  assert.deepEqual(brief.care[0].entries.map((entry) => entry.link), ["https://example.com/0", "https://example.com/1"]);
  assert.deepEqual(brief.maybe.map((entry) => entry.link), ["https://example.com/2"]);
});

test("picks with an unknown id, a bad score, or no topic or reason are dropped", async () => {
  const chat = scripted(
    JSON.stringify({
      items: [
        { id: 99, score: 5, topic: "Security", reason: "invented" },
        { id: 0, score: 9, topic: "Security", reason: "bad score" },
        { id: 1, score: 4, reason: "no topic" },
        { id: 2, score: 4, topic: "Security" },
        { id: 3, score: 4, topic: "Security", reason: "real" },
      ],
    }),
    summaryReply(),
  );
  const brief = await run([item(0), item(1), item(2), item(3)], chat);
  assert.deepEqual(brief.care[0].entries.map((entry) => entry.link), ["https://example.com/3"]);
});

test("within a topic the highest score comes first, and topics follow the profile order", async () => {
  const chat = scripted(
    scores(
      { id: 0, score: 4, topic: "JavaScript and Node" },
      { id: 1, score: 4, topic: "Security" },
      { id: 2, score: 5, topic: "Security" },
    ),
    summaryReply(),
  );
  const brief = await run([item(0), item(1), item(2)], chat);
  assert.deepEqual(brief.care.map((group) => group.topic), ["Security", "JavaScript and Node"]);
  assert.deepEqual(brief.care[0].entries.map((entry) => entry.score), [5, 4]);
});

test("worth-your-time is capped, and the best of what is cut moves to maybe ahead of the 3s", async () => {
  const items = [0, 1, 2, 3].map((n) => item(n));
  const chat = scripted(scores({ id: 0, score: 3 }, { id: 1, score: 4 }, { id: 2, score: 5 }, { id: 3, score: 4 }), summaryReply());
  const brief = await run(items, chat, { maxCare: 2 });
  assert.deepEqual(brief.care[0].entries.map((entry) => entry.link), ["https://example.com/2", "https://example.com/1"]);
  assert.deepEqual(brief.maybe.map((entry) => entry.link), ["https://example.com/3", "https://example.com/0"]);
});

test("maybe is capped too", async () => {
  const items = [0, 1, 2].map((n) => item(n));
  const chat = scripted(scores({ id: 0, score: 3 }, { id: 1, score: 3 }, { id: 2, score: 3 }), summaryReply());
  const brief = await run(items, chat, { maxMaybe: 2 });
  assert.equal(brief.maybe.length, 2);
});

test("the same story from two sources is shown to the model once and listed under both sources", async () => {
  const a = item(0, "TLDR Dev", "https://example.com/a?utm_source=tldr");
  const b = item(1, "TLDR AI", "https://example.com/a");
  const chat = scripted(scores({ id: 0, score: 5 }), summaryReply());
  const brief = await run([a, b], chat);
  assert.equal((chat.prompts[0].match(/^\[\d+\] /gm) ?? []).length, 1);
  assert.equal(brief.care[0].entries.length, 1);
  assert.equal(brief.care[0].entries[0].source, "TLDR Dev, TLDR AI");
  assert.deepEqual(brief.care[0].entries[0].alsoLinks, ["https://example.com/a"]);
  assert.equal(brief.considered, 2);
});

test("a story in three or more sources is a trend and leaves the topic sections", async () => {
  // Three sources carry one story: the links differ but the title is the same, so they merge into one group.
  const story = (n: number, source: string) => ({ ...item(n, source, `https://example.com/story?from=${source}`), title: "Worm hits npm and CI systems" });
  const items = [story(0, "A"), story(1, "B"), story(2, "C"), item(3, "D"), item(4, "E")];
  const chat = scripted(scores({ id: 0, score: 5 }, { id: 1, score: 4 }, { id: 2, score: 4 }), summaryReply());
  const brief = await run(items, chat);
  assert.deepEqual(brief.trends.map((trend) => trend.story), ["Worm hits npm and CI systems"]);
  assert.deepEqual(brief.trends[0].entries.map((entry) => entry.source), ["A", "B", "C"]);
  assert.deepEqual(brief.care[0].entries.map((entry) => entry.source), ["D", "E"]);
});

test("a story in only two sources is merged but is not a trend", async () => {
  const a = item(0, "A", "https://example.com/same");
  const b = item(1, "B", "https://example.com/same");
  const chat = scripted(scores({ id: 0, score: 5 }), summaryReply());
  const brief = await run([a, b], chat);
  assert.deepEqual(brief.trends, []);
  assert.equal(brief.care[0].entries.length, 1);
});

test("the summary is written only from the picks, not from everything", async () => {
  const chat = scripted(scores({ id: 0, score: 5, reason: "worm" }, { id: 1, score: 2 }), summaryReply());
  await run([item(0), item(1)], chat);
  assert.match(chat.prompts[1], /Title number 0/);
  assert.doesNotMatch(chat.prompts[1], /Title number 1/);
});

test("model output wrapped in think tags and code fences still parses", async () => {
  const chat = scripted("<think>let me see</think>\n```json\n" + scores({ id: 0, score: 5 }) + "\n```", summaryReply());
  const brief = await run([item(0)], chat);
  assert.equal(brief.care[0].entries.length, 1);
});

test("invalid JSON is retried once", async () => {
  const chat = scripted("not json", scores({ id: 0, score: 5 }), summaryReply());
  const brief = await run([item(0)], chat);
  assert.equal(brief.care[0].entries.length, 1);
  assert.equal(chat.calls, 3);
});

test("items are triaged in batches", async () => {
  const items = Array.from({ length: 5 }, (_, n) => item(n));
  const chat = scripted(scores({ id: 0, score: 5 }), scores({ id: 0, score: 5 }), scores(), summaryReply());
  const brief = await run(items, chat, { batchSize: 2 });
  assert.equal(chat.calls, 4);
  assert.deepEqual(brief.care[0].entries.map((entry) => entry.link), ["https://example.com/0", "https://example.com/2"]);
});

test("progress is reported per batch and for the summary", async () => {
  const messages: string[] = [];
  const chat = scripted(scores({ id: 0, score: 5 }), summaryReply());
  await run([item(0)], chat, { onProgress: (message: string) => messages.push(message) });
  assert.equal(messages.length, 2);
  assert.match(messages[0], /Triaged items 1-1 of 1/);
  assert.match(messages[1], /summary/);
});

test("a batch that keeps failing is skipped, the rest is kept", async () => {
  const chat = scripted(scores({ id: 0, score: 5 }), "bad", "still bad", summaryReply());
  const brief = await run([item(0), item(1)], chat, { batchSize: 1 });
  assert.equal(brief.care[0].entries.length, 1);
  assert.equal(brief.failedBatches, 1);
});

test("every batch failing is an error, so no empty brief is stored", async () => {
  await assert.rejects(run([item(0)], scripted("bad", "bad")), /every batch failed/);
});

test("a failed summary pass still yields the picks with a plain fallback summary", async () => {
  const chat = scripted(scores({ id: 0, score: 5 }), "bad", "bad");
  const brief = await run([item(0)], chat);
  assert.equal(brief.care[0].entries.length, 1);
  assert.match(brief.summary, /1 pick/);
});

test("nothing to consider yields an empty brief without calling the model", async () => {
  const chat = scripted();
  const brief = await run([], chat);
  assert.equal(chat.calls, 0);
  assert.equal(brief.considered, 0);
  assert.deepEqual(brief.care, []);
});

test("when nothing scores 3 or more there is nothing to summarise", async () => {
  const chat = scripted(scores({ id: 0, score: 2 }));
  const brief = await run([item(0)], chat);
  assert.equal(chat.calls, 1);
  assert.deepEqual(brief.care, []);
  assert.match(brief.summary, /Nothing stood out/);
});

test("summary points link to the picked items, with titles and links copied from the data", async () => {
  const chat = scripted(scores({ id: 0, score: 5 }, { id: 1, score: 4 }), summaryReply([{ headline: "The worm", why: "Check your lockfile.", ids: [0, 1] }]));
  const brief = await run([item(0), item(1)], chat);
  assert.equal(brief.summary, "The worm");
  assert.deepEqual(brief.summaryPoints, [
    {
      headline: "The worm",
      why: "Check your lockfile.",
      links: [
        { title: "Title number 0 of the day", link: "https://example.com/0", source: "Source 0" },
        { title: "Title number 1 of the day", link: "https://example.com/1", source: "Source 1" },
      ],
    },
  ]);
});

test("summary points with unknown ids or no text are dropped, bad ids are filtered, and item-number markers are stripped", async () => {
  const points = [
    { headline: "Invented", why: "No such item.", ids: [99] },
    { headline: "Real [0]", why: "Read it [0, 1].", ids: ["[0]", 99, 0] },
    { headline: "", why: "No headline.", ids: [0] },
  ];
  const chat = scripted(scores({ id: 0, score: 5 }), summaryReply(points));
  const brief = await run([item(0)], chat);
  assert.deepEqual(brief.summaryPoints?.map((point) => [point.headline, point.why, point.links.length]), [["Real", "Read it.", 1]]);
});

test("a summary reply with no usable points is retried", async () => {
  const chat = scripted(scores({ id: 0, score: 5 }), summaryReply([]), summaryReply([{ headline: "Second try", why: "Open it.", ids: [0] }]));
  const brief = await run([item(0)], chat);
  assert.equal(brief.summary, "Second try");
});

test("a story every source links the same way is one trend entry with all its sources", async () => {
  const story = (n: number, source: string) => ({ ...item(n, source, "https://example.com/story"), title: "Worm hits npm and CI systems" });
  const chat = scripted(scores({ id: 0, score: 5 }), summaryReply());
  const brief = await run([story(0, "A"), story(1, "B"), story(2, "C")], chat);
  assert.deepEqual(brief.trends[0].entries.map((entry) => entry.source), ["A, B, C"]);
});

test("the summary prompt includes the profile", async () => {
  const chat = scripted(scores({ id: 0, score: 5 }), summaryReply());
  await run([item(0)], chat);
  assert.match(chat.prompts[1], /Interest profile/);
});

const rerankReply = (...items: Array<{ id: unknown; score: number }>) => JSON.stringify({ items });

test("a final model re-scores the picks and writes the summary, while the first model only triages", async () => {
  const chat = scripted(scores({ id: 0, score: 5 }, { id: 1, score: 4 }, { id: 2, score: 4 }));
  const finalChat = scripted(rerankReply({ id: 0, score: 2 }, { id: 1, score: 5 }, { id: 2, score: 3 }), summaryReply([{ headline: "Keeper", why: "Open it.", ids: [1] }]));
  const brief = await run([item(0), item(1), item(2)], chat, { finalChat });
  assert.equal(chat.calls, 1);
  assert.equal(finalChat.calls, 2);
  assert.deepEqual(brief.care.flatMap((group) => group.entries.map((entry) => entry.source)), ["Source 1"]);
  assert.deepEqual(brief.maybe.map((entry) => entry.source), ["Source 2"]);
  assert.equal(brief.summary, "Keeper");
});

test("re-scored scores are what gets recorded for each item", async () => {
  const chat = scripted(scores({ id: 0, score: 5 }, { id: 1, score: 1, topic: undefined, reason: undefined }));
  const finalChat = scripted(rerankReply({ id: 0, score: 3 }), summaryReply());
  const brief = await run([item(0), item(1)], chat, { finalChat });
  assert.deepEqual(brief.scored?.map(({ source, score }) => `${source}:${score}`), ["Source 0:3", "Source 1:1"]);
});

test("if the final model cannot re-score, the first pass stands", async () => {
  const chat = scripted(scores({ id: 0, score: 5 }));
  const finalChat = scripted("nope", "still nope", summaryReply());
  const brief = await run([item(0)], chat, { finalChat });
  assert.equal(brief.care[0].entries.length, 1);
  assert.equal(brief.summary, "Big story");
});

test("a pick the final model leaves out of its reply keeps its first-pass score", async () => {
  const chat = scripted(scores({ id: 0, score: 5 }, { id: 1, score: 4 }));
  const finalChat = scripted(rerankReply({ id: 0, score: 4 }, { id: 99, score: 1 }), summaryReply());
  const brief = await run([item(0), item(1)], chat, { finalChat });
  assert.equal(brief.care[0].entries.length, 2);
});
