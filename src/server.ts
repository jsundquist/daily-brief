import { createHash } from "node:crypto";
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
  /** How often the schedule checks the clock, in milliseconds. */
  tickMs?: number;
}

/** Feeds are refreshed once this much clock time has passed since the last refresh. */
export const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

export interface RunningServer {
  url: string;
  close: () => Promise<void>;
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const now = options.now ?? (() => new Date());
  const store = new Store(options.dataFile);

  /** Fetch every source once. A failing source never affects the others. */
  async function runRefresh(): Promise<void> {
    lastRefresh = now().getTime();
    for (const source of options.sources) {
      try {
        const items = await fetchFeed(source.url, source.name, source.cap, options.fetchTimeoutMs);
        if (source.cap === undefined) {
          store.upsertItems(items);
        } else {
          store.replaceSourceItems(source.name, items);
        }
        store.recordSuccess(source.name, now().toISOString());
      } catch (error) {
        store.recordFailure(source.name, now().toISOString());
        console.error(`Failed to fetch ${source.name}:`, error);
      }
    }
  }

  let lastRefresh = 0;
  let inFlight: Promise<void> | null = null;

  /** Refreshes never overlap: a call while one is running joins it. */
  function refresh(): Promise<void> {
    inFlight ??= runRefresh().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  await refresh();

  /**
   * Driven by the injected clock rather than a one-hour timer, so a Mac that
   * slept past an hour mark refreshes on the first tick after waking.
   */
  const ticker = setInterval(() => {
    if (inFlight === null && now().getTime() - lastRefresh >= REFRESH_INTERVAL_MS) {
      void refresh();
    }
  }, options.tickMs ?? 30_000);
  ticker.unref();

  function render(): string {
    return renderPage(store.listItems(), options.sources, now(), store.sourceStatuses(), store.checkedLinks());
  }

  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(render());
      return;
    }
    if (req.method === "GET" && req.url === "/version") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(createHash("sha1").update(render()).digest("hex"));
      return;
    }
    if (req.method === "POST" && req.url === "/refresh") {
      refresh().then(() => {
        res.writeHead(204);
        res.end();
      });
      return;
    }
    if (req.method === "POST" && req.url === "/toggle") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        try {
          const { link } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (typeof link !== "string") {
            throw new Error("link must be a string");
          }
          store.toggleChecked(link);
          res.writeHead(204);
        } catch {
          res.writeHead(400);
        }
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
    close: () => {
      clearInterval(ticker);
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
