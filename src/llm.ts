export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Send a conversation to a model and get the reply text back. */
export type Chat = (messages: ChatMessage[]) => Promise<string>;

export interface OpenAiChatOptions {
  /** Up to and including the version segment, e.g. http://localhost:11434/v1 (Ollama) or http://localhost:1234/v1 (LM Studio). */
  baseUrl: string;
  model: string;
  /** A local model can take minutes on a large batch. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000;

/** Pull the text deltas out of a server-sent-events body. */
async function readStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let pending = "";
  let text = "";
  const take = (line: string): void => {
    if (!line.startsWith("data:")) {
      return;
    }
    const data = line.slice(5).trim();
    if (data === "" || data === "[DONE]") {
      return;
    }
    const delta = (JSON.parse(data) as { choices?: Array<{ delta?: { content?: unknown } }> }).choices?.[0]?.delta?.content;
    if (typeof delta === "string") {
      text += delta;
    }
  };
  for await (const chunk of body) {
    pending += decoder.decode(chunk, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    lines.forEach(take);
  }
  take(pending);
  return text;
}

/**
 * A chat client for any OpenAI-compatible server. The reply is streamed: a local model can think for
 * minutes before its first word, and a non-streamed request is dropped after five minutes of silence.
 */
export function openAiChat({ baseUrl, model, timeoutMs = DEFAULT_TIMEOUT_MS }: OpenAiChatOptions): Chat {
  return async (messages) => {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // No response_format: some local runners reject it (Ollama answers 501 "structured output is unavailable").
      // The caller extracts and validates the JSON itself.
      body: JSON.stringify({ model, messages, temperature: 0.2, stream: true }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok || response.body === null) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new Error(`Model server answered ${response.status}: ${detail}`);
    }
    const content = await readStream(response.body);
    if (content === "") {
      throw new Error("Model reply had no content");
    }
    return content;
  };
}
