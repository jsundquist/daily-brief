import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";

export async function serveFixture(path: string): Promise<{ url: string; close: () => Promise<void> }> {
  const body = readFileSync(path);
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/rss+xml" });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/feed.xml`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
