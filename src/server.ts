import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { fetchFeed } from "./feed.ts";
import { renderPage } from "./render.ts";
import { Store } from "./store.ts";

export interface Source {
  name: string;
  type: string;
  url: string;
}

export interface ServerOptions {
  sources: Source[];
  dataFile: string;
  port: number;
}

export interface RunningServer {
  url: string;
  close: () => Promise<void>;
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const store = new Store(options.dataFile);

  for (const source of options.sources) {
    try {
      store.upsertItems(await fetchFeed(source.url, source.name));
    } catch (error) {
      console.error(`Failed to fetch ${source.name}:`, error);
    }
  }

  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(renderPage(store.listItems()));
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
