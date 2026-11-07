import { startServer } from "./server.ts";
import { sources } from "./sources.ts";

const port = Number(process.env.PORT ?? 3000);
const dataFile = process.env.DATA_FILE ?? "data/store.json";

const running = await startServer({ sources, dataFile, port });
console.log(`Daily Brief at ${running.url}`);
