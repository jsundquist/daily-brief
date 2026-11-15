import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { ensureModelServer } from "../src/model-server.ts";

function listen(server: Server, port = 0): Promise<number> {
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
}

const answering = () => createServer((_req, res) => res.end("{}"));

test("returns without starting anything when the server already answers", async () => {
  const server = answering();
  const port = await listen(server);
  let started = 0;
  try {
    await ensureModelServer({ baseUrl: `http://127.0.0.1:${port}/v1`, start: () => (started += 1) });
    assert.equal(started, 0);
  } finally {
    server.close();
  }
});

test("starts the server when it is down and waits for it to answer", async () => {
  const probe = answering();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  const server = answering();
  let started = 0;
  try {
    await ensureModelServer({
      baseUrl: `http://127.0.0.1:${port}/v1`,
      start: () => {
        started += 1;
        void listen(server, port);
      },
      pollMs: 20,
    });
    assert.equal(started, 1);
  } finally {
    server.close();
  }
});

test("throws when the server never comes up", async () => {
  const probe = answering();
  const port = await listen(probe);
  await new Promise((resolve) => probe.close(resolve));
  await assert.rejects(ensureModelServer({ baseUrl: `http://127.0.0.1:${port}/v1`, waitMs: 100, pollMs: 20 }), /not reachable/);
});
