import { execFile, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { runBriefJob } from "./brief-job.ts";
import { BriefStore } from "./briefs-db.ts";
import { openAiChat } from "./llm.ts";
import { ensureModelServer } from "./model-server.ts";
import { sources } from "./sources.ts";
import { Store } from "./store.ts";

const customServer = process.env.BRIEF_BASE_URL !== undefined;
const baseUrl = process.env.BRIEF_BASE_URL ?? "http://localhost:11434/v1";
const model = process.env.BRIEF_MODEL ?? "gemma4:latest";
// The first model triages every item; this slower one re-scores the picks and writes the summary. BRIEF_FINAL_MODEL=none runs the first model alone.
const finalModelSetting = process.env.BRIEF_FINAL_MODEL ?? "qwen3.8:27b";
const finalModel = finalModelSetting === "none" ? undefined : finalModelSetting;
const dataFile = process.env.DATA_FILE ?? "data/store.json";
const briefsFile = process.env.BRIEFS_DB ?? "data/briefs.db";
const profile = readFileSync(process.env.BRIEF_PROFILE ?? "skills/daily-brief/profile.md", "utf8");

/** Best-effort macOS notification; never fails the job. */
function notify(message: string): void {
  execFile("osascript", ["-e", `display notification ${JSON.stringify(message)} with title "Daily brief"`], () => {});
}

try {
  await ensureModelServer({
    baseUrl,
    // Only Ollama is started for us; a custom server (LM Studio) is expected to be running.
    start: customServer ? undefined : () => spawn(process.env.OLLAMA_BIN ?? "ollama", ["serve"], { detached: true, stdio: "ignore" }).unref(),
  });
  const briefs = new BriefStore(briefsFile);
  const brief = await runBriefJob({
    sources,
    store: new Store(dataFile),
    briefs,
    chat: openAiChat({ baseUrl, model }),
    finalChat: finalModel === undefined ? undefined : openAiChat({ baseUrl, model: finalModel }),
    model: finalModel === undefined ? model : `${model} + ${finalModel}`,
    profile,
    now: () => new Date(),
    onProgress: (message) => console.log(`[${new Date().toLocaleTimeString()}] ${message}`),
  });
  const picks = brief.care.reduce((total, group) => total + group.entries.length, 0) + brief.maybe.length + brief.trends.length;
  console.log(`Brief for ${brief.date}: ${picks} picks from ${brief.considered} items.`);
  console.log(brief.summary);
  notify(`Your brief is ready: ${picks} picks from ${brief.considered} items.`);
  briefs.close();
} catch (error) {
  console.error("Brief job failed:", error);
  notify("The brief could not be generated.");
  process.exit(1);
}
