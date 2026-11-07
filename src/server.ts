import { createHash } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
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

/** Largest request body accepted, in bytes. */
const MAX_BODY_BYTES = 4096;

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        // Keep draining so the client can read the 413, but stop buffering.
        reject(new Error("body too large"));
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** At most this many feeds are fetched at the same time. */
const MAX_CONCURRENT_FETCHES = 5;

export interface RunningServer {
  url: string;
  /** Resolves when the startup refresh has finished (it runs in the background). */
  firstRefresh: Promise<void>;
  close: () => Promise<void>;
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const now = options.now ?? (() => new Date());
  const store = new Store(options.dataFile);

  /** Fetch one source. A failure is recorded and never propagates to the others. */
  async function refreshSource(source: Source): Promise<void> {
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

  /** Fetch every source once, a few at a time. */
  async function runRefresh(): Promise<void> {
    lastRefresh = now().getTime();
    const queue = [...options.sources];
    const worker = async (): Promise<void> => {
      for (let source = queue.shift(); source !== undefined; source = queue.shift()) {
        await refreshSource(source);
      }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_FETCHES, queue.length) }, worker));
    store.prune(now());
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

  function render(): string {
    return renderPage(store.listItems(), options.sources, now(), store.sourceStatuses(), store.checkedLinks());
  }

  /** Same-origin only: the Host must be this server and any Origin must match it. */
  function isLocalRequest(req: IncomingMessage): boolean {
    const port = (server.address() as AddressInfo).port;
    const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
    const host = req.headers.host ?? "";
    if (!hosts.includes(host)) {
      return false;
    }
    const origin = req.headers.origin;
    return origin === undefined || origin === `http://${host}`;
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
    if (req.method === "POST" && (req.url === "/refresh" || req.url === "/toggle")) {
      if (!isLocalRequest(req)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
    }
    if (req.method === "POST" && req.url === "/refresh") {
      refresh()
        .then(() => {
          res.writeHead(204);
          res.end();
        })
        .catch((error) => {
          console.error("Refresh failed:", error);
          res.writeHead(500);
          res.end();
        });
      return;
    }
    if (req.method === "POST" && req.url === "/toggle") {
      if (!/^application\/json\s*(;|$)/i.test(req.headers["content-type"] ?? "")) {
        res.writeHead(415);
        res.end();
        return;
      }
      readBody(req, MAX_BODY_BYTES).then(
        (body) => {
          try {
            const { link } = JSON.parse(body);
            if (typeof link !== "string") {
              throw new Error("link must be a string");
            }
            if (store.hasLink(link)) {
              store.toggleChecked(link);
            }
            res.writeHead(204);
          } catch {
            res.writeHead(400);
          }
          res.end();
        },
        () => {
          res.writeHead(413, { connection: "close" });
          res.end();
        },
      );
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  });

  await new Promise<void>((resolve) => server.listen(options.port, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const firstRefresh = refresh();

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

  return {
    firstRefresh,
    url: `http://127.0.0.1:${port}/`,
    close: () => {
      clearInterval(ticker);
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
