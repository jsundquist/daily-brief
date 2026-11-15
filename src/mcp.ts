import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { briefMarkdown } from "./brief-text.ts";
import type { BriefStore } from "./briefs-db.ts";

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

/** Read-only access to the stored briefs. It never generates or changes anything. */
export function createBriefMcpServer(briefs: BriefStore): McpServer {
  const server = new McpServer({ name: "daily-brief", version: "0.1.0" });

  server.registerTool(
    "get_brief",
    {
      description:
        "Get the user's daily brief: an executive summary, what is worth their time by topic, borderline items, and stories covered by several sources. Returns the latest brief unless a date is given.",
      inputSchema: { date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD; omit for the latest brief") },
    },
    async ({ date }) => {
      const stored = date === undefined ? briefs.latest() : briefs.get(date);
      if (stored === null) {
        return text(date === undefined ? "No brief has been generated yet. `npm run brief` in the daily-brief project makes one." : `No brief for ${date}.`);
      }
      return text(briefMarkdown(stored));
    },
  );

  server.registerTool(
    "list_briefs",
    {
      description: "List the dates of stored daily briefs, newest first.",
      inputSchema: { limit: z.number().int().min(1).max(100).optional().describe("How many to list; default 14") },
    },
    async ({ limit }) => {
      const rows = briefs.list(limit ?? 14);
      if (rows.length === 0) {
        return text("No briefs stored yet.");
      }
      return text(rows.map((row) => `${row.date}: ${row.considered} items considered (${row.model}, ${row.generatedAt})`).join("\n"));
    },
  );

  return server;
}
