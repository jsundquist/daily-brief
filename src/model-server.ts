export interface EnsureModelServerOptions {
  /** The OpenAI-compatible base URL, including the version segment. */
  baseUrl: string;
  /** Starts the server if it is not already running. Omit when it is managed elsewhere (e.g. LM Studio). */
  start?: () => void;
  /** How long to wait for the server to answer after starting it. */
  waitMs?: number;
  pollMs?: number;
}

async function isUp(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Resolve once the model server answers; start it first if it is down. Throws if it never comes up. */
export async function ensureModelServer({ baseUrl, start, waitMs = 60_000, pollMs = 1000 }: EnsureModelServerOptions): Promise<void> {
  if (await isUp(baseUrl)) {
    return;
  }
  start?.();
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    if (await isUp(baseUrl)) {
      return;
    }
  }
  throw new Error(`Model server at ${baseUrl} is not reachable`);
}
