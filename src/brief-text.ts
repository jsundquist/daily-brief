import type { StoredBrief } from "./briefs-db.ts";
import type { BriefEntry } from "./summary.ts";

function line(entry: BriefEntry): string {
  return `- [${entry.title}](${entry.link}) (${entry.source}, ${entry.score}/5): ${entry.reason}`;
}

/** The brief as Markdown, for an agent to read out or a person to skim. */
export function briefMarkdown({ brief, generatedAt, model }: StoredBrief): string {
  const parts: string[] = [`# Daily brief for ${brief.date}`, "", brief.summary];
  if (brief.trends.length > 0) {
    parts.push("", "## Across your sources");
    for (const trend of brief.trends) {
      parts.push("", `**${trend.story}**`, ...trend.entries.map(line));
    }
  }
  if (brief.care.length > 0) {
    parts.push("", "## Worth your time");
    for (const group of brief.care) {
      parts.push("", `### ${group.topic}`, ...group.entries.map(line));
    }
  }
  if (brief.maybe.length > 0) {
    parts.push("", "## Maybe of interest", "", ...brief.maybe.map(line));
  }
  const note = brief.failedBatches > 0 ? `; ${brief.failedBatches} batch(es) could not be triaged` : "";
  parts.push("", `_${brief.considered} items considered by ${model} at ${generatedAt}${note}._`);
  return parts.join("\n");
}
