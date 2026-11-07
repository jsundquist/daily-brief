import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fetchFeed } from "./feed.ts";
import { renderPage, type Source } from "./render.ts";
import { Store } from "./store.ts";

export interface ServerOptions {
  sources: Source[];
  dataFile: string;
  port: number;
  /** Injected clock; defaults to the real time. */
  now?: () => Date;
  /** Per-feed fetch timeout in milliseconds. */
  fetchTimeoutMs?: number;
}

export interface RunningServer {
  url: string;
  close: () => Promise<void>;
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const now = options.now ?? (() => new Date());
  const store = new Store(options.dataFile);

  /** Fetch every source once. A failing source never affects the others. */
  async function refresh(): Promise<void> {
    for (const source of options.sources) {
      try {
        store.upsertItems(await fetchFeed(source.url, source.name, source.cap, options.fetchTimeoutMs));
        store.recordSuccess(source.name, now().toISOString());
      } catch (error) {
        store.recordFailure(source.name, now().toISOString());
        console.error(`Failed to fetch ${source.name}:`, error);
      }
    }
  }

  await refresh();

  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(renderPage(store.listItems(), options.sources, now(), store.sourceStatuses()));
      return;
    }
    if (req.method === "POST" && req.url === "/refresh") {
      refresh().then(() => {
        res.writeHead(204);
        res.end();
      });
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  });

  await new Promise<void>((resolve) => server.listen(options.port, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
