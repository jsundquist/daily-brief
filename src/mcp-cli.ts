import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BriefStore } from "./briefs-db.ts";
import { createBriefMcpServer } from "./mcp.ts";

const briefsFile = process.env.BRIEFS_DB ?? new URL("../data/briefs.db", import.meta.url).pathname;

await createBriefMcpServer(new BriefStore(briefsFile)).connect(new StdioServerTransport());
