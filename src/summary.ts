import type { BriefItem } from "./brief.ts";
import { groupDuplicates, type Group } from "./dedupe.ts";
import type { Chat } from "./llm.ts";

export interface BriefEntry {
  title: string;
  link: string;
  /** Every source that carried this story, comma separated. */
  source: string;
  reason: string;
  /** The model's 1-5 score; 5 is a must-read. */
  score: number;
  /** Links of the same story from other sources, so they count as briefed too. */
  alsoLinks?: string[];
}

/** One item and the score the model gave it, kept for every scored item so misses can be looked up later. */
export interface ScoredItem {
  title: string;
  link: string;
  source: string;
  score: number;
}

export interface Brief {
  /** Local calendar date the brief is for, YYYY-MM-DD. */
  date: string;
  /** The executive summary. */
  summary: string;
  /** Items scored 4 or 5, grouped by topic in profile order, best first. */
  care: Array<{ topic: string; entries: BriefEntry[] }>;
  /** Items scored 3, and the best of those scored 4 or 5 that did not fit under the cap. */
  maybe: BriefEntry[];
  /** One story carried by three or more distinct sources. */
  trends: Array<{ story: string; entries: BriefEntry[] }>;
  /** How many items the model looked at, before merging duplicates. */
  considered: number;
  /** Batches that could not be triaged and are missing from the brief. */
  failedBatches: number;
  /** Every item the model scored, 1-5, including the ones left out. Present on a freshly generated brief; stored apart from it. */
  scored?: ScoredItem[];
}

export interface GenerateOptions {
  /** Candidates only: already-struck and already-briefed items are filtered out by the caller. */
  items: BriefItem[];
  profile: string;
  chat: Chat;
  date: string;
  batchSize?: number;
  /** At most this many items under "worth your time". */
  maxCare?: number;
  /** At most this many under "maybe". */
  maxMaybe?: number;
  /** Told as each stage finishes, so a long local-model run shows it is alive. */
  onProgress?: (message: string) => void;
}

/** A story needs this many distinct sources to count as a trend. */
const TREND_MIN_SOURCES = 3;

/** Scores at or above this are worth the reader's time; a score of exactly MAYBE_SCORE is borderline. */
const CARE_SCORE = 4;
const MAYBE_SCORE = 3;

const DEFAULT_BATCH_SIZE = 40;
const DEFAULT_MAX_CARE = 25;
const DEFAULT_MAX_MAYBE = 10;

/** Item summaries are cut to this many characters in the prompt. */
const SUMMARY_PROMPT_CHARS = 240;

interface Pick {
  id: number;
  topic: string;
  score: number;
  reason: string;
}

function parseJson(text: string): unknown {
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "");
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end < start) {
    throw new Error("no JSON object in model reply");
  }
  return JSON.parse(stripped.slice(start, end + 1));
}

/** Ask the model, parse and validate its reply, and retry once if either step fails. */
async function askJson<T>(chat: Chat, system: string, user: string, validate: (json: unknown) => T): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const reply = await chat([
        { role: "system", content: system },
        { role: "user", content: user },
      ]);
      return validate(parseJson(reply));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export function profileTopics(profile: string): string[] {
  return [...profile.matchAll(/^## (.+)$/gm)].map((match) => match[1].trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const TRIAGE_SYSTEM = "You triage a reading list for one person. Reply with a single JSON object and nothing else.";

function triagePrompt(profile: string, batch: BriefItem[]): string {
  const lines = batch.map((item, id) => {
    const summary = item.summary.replace(/\s+/g, " ").slice(0, SUMMARY_PROMPT_CHARS);
    return `[${id}] ${item.source}: ${item.title} -- ${summary}`;
  });
  return [
    "Here is the person's interest profile:",
    "",
    profile,
    "",
    "Below are items from their feeds. Score EVERY item from 1 to 5 for this person:",
    "5 = a must-read today. A list this size has at most one or two.",
    "4 = clearly matches what they care about and is worth their time today.",
    "3 = borderline; you are not sure, but it might interest them.",
    "2 = marginal. 1 = not for them: matches a skip rule, fits no topic, or is sponsored, event promotion or product marketing.",
    "Be strict. Most items should score 1 or 2, and only a few should score 4 or 5.",
    "For every item scoring 3 or more, also give:",
    "- topic: one of the profile's topic headings, exactly as written.",
    '- reason: at most 20 words on why it matters, written to the person as "you" (never "the person" or "the user"), not a paraphrase of the summary.',
    "Judge only from the title and summary given. Do not claim to know an article's contents.",
    'id is the number in square brackets. Reply: {"items":[{"id":0,"score":1},{"id":1,"score":4,"topic":"...","reason":"..."}]}',
    "",
    "Items:",
    ...lines,
  ].join("\n");
}

/** What the model said about one batch: every valid score, and the items scoring 3 or more with a topic and reason. */
interface Triage {
  scores: Array<{ id: number; score: number }>;
  picks: Pick[];
}

/** Validate a triage reply. Anything malformed is dropped. */
function validateScores(json: unknown, batchLength: number): Triage {
  if (!isRecord(json) || !Array.isArray(json.items)) {
    throw new Error("reply has no items array");
  }
  const seen = new Set<number>();
  const scores: Triage["scores"] = [];
  const picks: Pick[] = [];
  for (const raw of json.items) {
    if (!isRecord(raw)) {
      continue;
    }
    const { id, score, topic, reason } = raw;
    if (typeof id !== "number" || !Number.isInteger(id) || id < 0 || id >= batchLength || seen.has(id)) {
      continue;
    }
    if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 5) {
      continue;
    }
    seen.add(id);
    scores.push({ id, score });
    if (score >= MAYBE_SCORE && typeof topic === "string" && typeof reason === "string" && topic.trim() !== "" && reason.trim() !== "") {
      picks.push({ id, topic: topic.trim(), score, reason: reason.trim() });
    }
  }
  return { scores, picks };
}

const SUMMARY_SYSTEM = "You write the executive summary of a person's daily reading brief. Reply with a single JSON object and nothing else.";

interface Picked extends Pick {
  group: Group;
  /** Position in the combined list, used as the id in the summary prompt. */
  key: number;
}

function sourcesOf(group: Group): string[] {
  return [...new Set(group.members.map((member) => member.source))];
}

function summaryPrompt(picked: Picked[]): string {
  const lines = picked.map(({ key, group, topic, score, reason }) => `[${key}] (score ${score}, ${topic}) ${sourcesOf(group).join(", ")}: ${group.item.title} -- ${reason}`);
  return [
    "These are the items picked for today's brief, with why each was picked.",
    "",
    'Write "summary": an executive summary of what this person should know today, written to them as "you".',
    "At most 4 sentences and 90 words. Start with the most important story and name it; no preamble such as \"you must be aware\".",
    "Use only what the titles and reasons say; do not add facts and do not mention item numbers.",
    'Reply: {"summary":"..."}',
    "",
    "Items:",
    ...lines,
  ].join("\n");
}

function validateSummary(json: unknown): string {
  if (!isRecord(json) || typeof json.summary !== "string" || json.summary.trim() === "") {
    throw new Error("reply has no summary");
  }
  return json.summary.trim();
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** A story that comes up in several sources at once: its title without a reading-time suffix. */
function storyName(title: string): string {
  return title.replace(/\s*\(\d+ minute read\)\s*$/, "");
}

/** One entry for the whole group: every source that carried it, and the other links so they count as briefed. */
function entryOf({ group, reason, score }: Picked): BriefEntry {
  const alsoLinks = [...new Set(group.members.map((member) => member.link))].filter((link) => link !== group.item.link);
  return {
    title: group.item.title,
    link: group.item.link,
    source: sourcesOf(group).join(", "),
    reason,
    score,
    ...(alsoLinks.length > 0 ? { alsoLinks } : {}),
  };
}

/** One entry per distinct link, so a story every source links to the same way is listed once with all its sources. */
function trendEntries({ group, reason, score }: Picked): BriefEntry[] {
  const byLink = new Map<string, BriefEntry>();
  for (const member of group.members) {
    const seen = byLink.get(member.link);
    if (seen === undefined) {
      byLink.set(member.link, { title: member.title, link: member.link, source: member.source, reason, score });
    } else if (!seen.source.split(", ").includes(member.source)) {
      seen.source += `, ${member.source}`;
    }
  }
  return [...byLink.values()];
}

/** Best score first; among equals the item order (newest first) is kept. */
function bestFirst(a: Picked, b: Picked): number {
  return b.score - a.score || a.key - b.key;
}

/**
 * Build the brief. The model scores items and returns only item numbers; every title and link in the result
 * is copied from the data, so nothing it invents can reach the reader. Duplicates are merged and trends found
 * by code, not by the model.
 */
export async function generateBrief({
  items,
  profile,
  chat,
  date,
  batchSize = DEFAULT_BATCH_SIZE,
  maxCare = DEFAULT_MAX_CARE,
  maxMaybe = DEFAULT_MAX_MAYBE,
  onProgress,
}: GenerateOptions): Promise<Brief> {
  const brief: Brief = { date, summary: "", care: [], maybe: [], trends: [], considered: items.length, failedBatches: 0 };
  if (items.length === 0) {
    brief.summary = "Nothing new to look at today.";
    return brief;
  }

  const groups = groupDuplicates(items);
  const all: Picked[] = [];
  const scored: ScoredItem[] = [];
  let triaged = 0;
  for (let start = 0; start < groups.length; start += batchSize) {
    const batch = groups.slice(start, start + batchSize);
    const began = Date.now();
    try {
      const { picks, scores } = await askJson(chat, TRIAGE_SYSTEM, triagePrompt(profile, batch.map((group) => group.item)), (json) => validateScores(json, batch.length));
      for (const pick of picks) {
        all.push({ ...pick, group: batch[pick.id], key: all.length });
      }
      for (const { id, score } of scores) {
        for (const member of batch[id].members) {
          scored.push({ title: member.title, link: member.link, source: member.source, score });
        }
      }
      triaged += 1;
      const strong = picks.filter((pick) => pick.score >= CARE_SCORE).length;
      onProgress?.(
        `Triaged items ${start + 1}-${start + batch.length} of ${groups.length} in ${Math.round((Date.now() - began) / 1000)}s: ${strong} scored 4-5, ${picks.length - strong} scored 3`,
      );
    } catch (error) {
      brief.failedBatches += 1;
      console.error(`Could not triage items ${start + 1}-${start + batch.length}:`, error);
    }
  }
  if (triaged === 0) {
    throw new Error("every batch failed, no brief generated");
  }
  brief.scored = scored;

  const ranked = [...all].sort(bestFirst);
  const strong = ranked.filter(({ score }) => score >= CARE_SCORE);
  const care = strong.slice(0, maxCare);
  const maybe = [...strong.slice(maxCare), ...ranked.filter(({ score }) => score === MAYBE_SCORE)].slice(0, maxMaybe);
  const selected = [...care, ...maybe];

  if (selected.length === 0) {
    brief.summary = "Nothing stood out today.";
    return brief;
  }

  const began = Date.now();
  try {
    brief.summary = await askJson(chat, SUMMARY_SYSTEM, summaryPrompt(selected), validateSummary);
    onProgress?.(`Wrote the summary in ${Math.round((Date.now() - began) / 1000)}s`);
  } catch (error) {
    console.error("Could not write the summary:", error);
    brief.summary = `${plural(selected.length, "pick")} from ${brief.considered} items considered.`;
  }

  const isTrend = (pick: Picked): boolean => sourcesOf(pick.group).length >= TREND_MIN_SOURCES;
  for (const pick of selected.filter(isTrend)) {
    brief.trends.push({
      story: storyName(pick.group.item.title),
      entries: trendEntries(pick),
    });
  }

  const order = profileTopics(profile);
  const rank = (topic: string): number => {
    const index = order.indexOf(topic);
    return index === -1 ? order.length : index;
  };
  const careRest = care.filter((pick) => !isTrend(pick));
  const topics = [...new Set(careRest.map(({ topic }) => topic))].sort((a, b) => rank(a) - rank(b));
  brief.care = topics.map((topic) => ({ topic, entries: careRest.filter((pick) => pick.topic === topic).map(entryOf) }));
  brief.maybe = maybe.filter((pick) => !isTrend(pick)).map(entryOf);
  return brief;
}
