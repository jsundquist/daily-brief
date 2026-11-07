import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface FeedState {
  body: Buffer;
  /** HTTP status the feed answers with. */
  status: number;
  /** When true the feed never answers (to exercise timeouts). */
  hang: boolean;
  /** Requests received so far. */
  hits: number;
}

export interface FixtureFeed {
  state: FeedState;
  url: string;
  close: () => Promise<void>;
}

/** Serve a feed body over local HTTP; the test can change `state` between fetches. */
export async function serveFeed(body: Buffer | string): Promise<FixtureFeed> {
  const state: FeedState = { body: Buffer.from(body), status: 200, hang: false, hits: 0 };
  const server: Server = createServer((_req, res) => {
    state.hits += 1;
    if (state.hang) {
      return;
    }
    res.writeHead(state.status, { "content-type": "application/rss+xml" });
    res.end(state.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    state,
    url: `http://127.0.0.1:${port}/feed.xml`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export function serveFixture(path: string): Promise<FixtureFeed> {
  return serveFeed(readFileSync(path));
}

/** A fresh, empty store file path in a temp directory. */
export function tempStore(): string {
  return join(mkdtempSync(join(tmpdir(), "brief-")), "store.json");
}
