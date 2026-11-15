// Runs the same batch of real items through several local models and compares them.
// Usage: node scripts/bench-models.ts [model ...]   (env: BRIEF_BASE_URL, BENCH_ITEMS)
import { readFileSync, writeFileSync } from "node:fs";
import { briefItems } from "../src/brief.ts";
import { openAiChat, type Chat } from "../src/llm.ts";
import { sources } from "../src/sources.ts";
import { Store } from "../src/store.ts";
import { generateBrief, type Brief } from "../src/summary.ts";

const baseUrl = process.env.BRIEF_BASE_URL ?? "http://localhost:11434/v1";
const itemCount = Number(process.env.BENCH_ITEMS ?? 40);
const models = process.argv.length > 2 ? process.argv.slice(2) : ["gemma4:latest", "qwen3:30b", "qwen3.8:27b"];
const profile = readFileSync("skills/daily-brief/profile.md", "utf8");

const store = new Store("data/store.json");
const items = briefItems(store.listItems(), sources, new Date(), store.checkedLinks())
  .filter((item) => !item.done)
  .slice(0, itemCount);

const stamp = (): string => new Date().toLocaleTimeString();
const log = (message: string): void => console.log(`[${stamp()}] ${message}`);

interface Result {
  model: string;
  seconds: number;
  calls: number;
  failedBatches: number;
  care: number;
  maybe: number;
  trends: number;
  summaryWords: number;
  links: Set<string>;
  careLinks: Set<string>;
  brief: Brief | null;
  error?: string;
}

async function bench(model: string): Promise<Result> {
  const base = openAiChat({ baseUrl, model, timeoutMs: 15 * 60 * 1000 });
  let calls = 0;
  const chat: Chat = async (messages) => {
    calls += 1;
    const began = Date.now();
    const heartbeat = setInterval(() => log(`  ${model}: call ${calls} still running, ${Math.round((Date.now() - began) / 1000)}s`), 30_000);
    try {
      return await base(messages);
    } finally {
      clearInterval(heartbeat);
    }
  };

  log(`${model}: starting (the first call includes loading the model)`);
  const began = Date.now();
  const result: Result = { model, seconds: 0, calls: 0, failedBatches: 0, care: 0, maybe: 0, trends: 0, summaryWords: 0, links: new Set(), careLinks: new Set(), brief: null };
  try {
    const brief = await generateBrief({
      items,
      profile,
      chat,
      date: "bench",
      batchSize: itemCount,
      onProgress: (message) => log(`  ${model}: ${message}`),
    });
    const careEntries = brief.care.flatMap((group) => group.entries);
    const trendEntries = brief.trends.flatMap((trend) => trend.entries);
    result.brief = brief;
    result.failedBatches = brief.failedBatches;
    result.care = careEntries.length + trendEntries.length;
    result.maybe = brief.maybe.length;
    result.trends = brief.trends.length;
    result.summaryWords = brief.summary.split(/\s+/).length;
    result.careLinks = new Set([...careEntries, ...trendEntries].map((entry) => entry.link));
    result.links = new Set([...result.careLinks, ...brief.maybe.map((entry) => entry.link)]);
  } catch (error) {
    result.error = String(error);
  }
  result.seconds = Math.round((Date.now() - began) / 1000);
  result.calls = calls;
  log(`${model}: ${result.error ?? "done"} in ${result.seconds}s (${calls} model calls)`);
  return result;
}

function jaccard(a: Set<string>, b: Set<string>): string {
  const union = new Set([...a, ...b]).size;
  if (union === 0) {
    return "n/a";
  }
  return `${Math.round(([...a].filter((link) => b.has(link)).length / union) * 100)}%`;
}

log(`Benchmarking ${models.length} models on the same ${items.length} items: ${models.join(", ")}`);
const results: Result[] = [];
for (const model of models) {
  results.push(await bench(model));
}

console.log("\n=== Results ===");
console.log("model".padEnd(18), "secs".padStart(5), "calls".padStart(6), "care".padStart(5), "maybe".padStart(6), "trends".padStart(7), "sum words".padStart(10), "failed".padStart(7));
for (const r of results) {
  console.log(r.model.padEnd(18), String(r.seconds).padStart(5), String(r.calls).padStart(6), String(r.care).padStart(5), String(r.maybe).padStart(6), String(r.trends).padStart(7), String(r.summaryWords).padStart(10), String(r.error ? "ERROR" : r.failedBatches).padStart(7));
}
console.log("(calls above 2 means a reply failed validation and was retried)\n");

const reference = results.find((r) => r.brief !== null && r.model === models[models.length - 1]) ?? results[0];
console.log(`Agreement with ${reference.model} (shared picks / all picks):`);
for (const r of results) {
  if (r !== reference) {
    console.log(`  ${r.model}: all picks ${jaccard(r.links, reference.links)}, care picks ${jaccard(r.careLinks, reference.careLinks)}`);
  }
}

const out = process.env.BENCH_OUT;
if (out !== undefined) {
  writeFileSync(out, JSON.stringify(results.map((r) => ({ ...r, links: [...r.links], careLinks: [...r.careLinks] })), null, 2));
  log(`Full results written to ${out}`);
}
