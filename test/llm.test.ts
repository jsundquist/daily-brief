import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { openAiChat } from "../src/llm.ts";

type Reply = { status: number; chunks: string[] };

async function serve(handler: (body: any) => Reply) {
  const requests: Array<{ url: string; body: any }> = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", async () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests.push({ url: req.url ?? "", body });
      const { status, chunks: parts } = handler(body);
      res.writeHead(status, { "content-type": status === 200 ? "text/event-stream" : "application/json" });
      for (const part of parts) {
        res.write(part);
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  return { baseUrl, requests, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

test("streams the request to /chat/completions and joins the deltas", async () => {
  const server = await serve(() => ({ status: 200, chunks: [delta("hel"), delta("lo"), "data: [DONE]\n\n"] }));
  try {
    const chat = openAiChat({ baseUrl: server.baseUrl, model: "m" });
    assert.equal(await chat([{ role: "user", content: "hi" }]), "hello");
    assert.equal(server.requests[0].url, "/v1/chat/completions");
    assert.equal(server.requests[0].body.model, "m");
    assert.equal(server.requests[0].body.stream, true);
    assert.deepEqual(server.requests[0].body.messages, [{ role: "user", content: "hi" }]);
    assert.equal(server.requests[0].body.response_format, undefined);
  } finally {
    await server.close();
  }
});

test("a delta split across network chunks still parses", async () => {
  const whole = delta("split");
  const server = await serve(() => ({ status: 200, chunks: [whole.slice(0, 20), whole.slice(20), "data: [DONE]\n\n"] }));
  try {
    const chat = openAiChat({ baseUrl: server.baseUrl, model: "m" });
    assert.equal(await chat([{ role: "user", content: "hi" }]), "split");
  } finally {
    await server.close();
  }
});

test("reasoning-only deltas are not part of the reply", async () => {
  const reasoning = `data: ${JSON.stringify({ choices: [{ delta: { reasoning: "thinking..." } }] })}\n\n`;
  const server = await serve(() => ({ status: 200, chunks: [reasoning, delta("answer"), "data: [DONE]\n\n"] }));
  try {
    const chat = openAiChat({ baseUrl: server.baseUrl, model: "m" });
    assert.equal(await chat([{ role: "user", content: "hi" }]), "answer");
  } finally {
    await server.close();
  }
});

test("a non-200 answer is an error that includes the server's message", async () => {
  const server = await serve(() => ({ status: 500, chunks: [JSON.stringify({ error: "boom" })] }));
  try {
    const chat = openAiChat({ baseUrl: server.baseUrl, model: "m" });
    await assert.rejects(chat([{ role: "user", content: "hi" }]), /500.*boom/);
  } finally {
    await server.close();
  }
});

test("a stream with no content is an error", async () => {
  const server = await serve(() => ({ status: 200, chunks: ["data: [DONE]\n\n"] }));
  try {
    const chat = openAiChat({ baseUrl: server.baseUrl, model: "m" });
    await assert.rejects(chat([{ role: "user", content: "hi" }]), /no content/);
  } finally {
    await server.close();
  }
});
