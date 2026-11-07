import { startServer, type Source } from "./server.ts";

const sources: Source[] = [{ name: "Hacker News", type: "news", url: "https://news.ycombinator.com/rss" }];

const port = Number(process.env.PORT ?? 3000);
const dataFile = process.env.DATA_FILE ?? "data/store.json";

const running = await startServer({ sources, dataFile, port });
console.log(`Daily Brief at ${running.url}`);
