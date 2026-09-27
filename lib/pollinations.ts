import { extractJson } from "./utils";

/**
 * Thin client for the free Pollinations.ai text API.
 *
 * Default (zero-config) mode hits the anonymous OpenAI-compatible endpoint
 * `POST https://text.pollinations.ai/openai`, which needs no API key at all.
 * Set POLLINATIONS_API_KEY (sk_...) to switch to the authenticated
 * `https://gen.pollinations.ai/v1/chat/completions` endpoint for higher limits.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface PollinationsConfig {
  endpoint: string;
  model: string;
  auth: "api-key" | "anonymous";
  referrer: string;
}

export function pollinationsConfig(): PollinationsConfig {
  const key = process.env.POLLINATIONS_API_KEY?.trim();
  const explicitUrl = process.env.POLLINATIONS_TEXT_URL?.trim();
  const endpoint =
    explicitUrl ||
    (key
      ? "https://gen.pollinations.ai/v1/chat/completions"
      : "https://text.pollinations.ai/openai");
  const model =
    process.env.POLLINATIONS_MODEL?.trim() || (key ? "openai" : "openai-fast");
  const referrer =
    process.env.POLLINATIONS_REFERRER?.trim() || "internship-compass";

  return {
    endpoint,
    model,
    auth: key ? "api-key" : "anonymous",
    referrer,
  };
}

export class PollinationsError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "PollinationsError";
    this.status = status;
  }
}

export interface ChatJsonOptions {
  system: string;
  user: string;
  /** Stable seed keeps repeated evaluations comparable. */
  seed?: number;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retries?: number;
}

export interface ChatJsonResult<T> {
  data: T;
  model: string;
  endpoint: string;
  auth: "api-key" | "anonymous";
  attempts: number;
  latencyMs: number;
}

interface OpenAiChoice {
  message?: { content?: string; reasoning?: string };
  text?: string;
}

interface OpenAiResponse {
  choices?: OpenAiChoice[];
  model?: string;
  error?: { message?: string } | string;
  content?: string;
}

export async function chatJson<T>(options: ChatJsonOptions): Promise<ChatJsonResult<T>> {
  const config = pollinationsConfig();
  const key = process.env.POLLINATIONS_API_KEY?.trim();
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 55_000;
  const started = Date.now();
  // Reasoning models (gpt-oss family) spend `max_tokens` on their hidden reasoning
  // track first; if the reasoning is long, `content` comes back empty. When that
  // happens we retry with a bigger budget instead of giving up.
  let maxTokens = options.maxTokens ?? 1400;
  let seed = options.seed ?? 42;

  const url = new URL(config.endpoint);
  url.searchParams.set("referrer", config.referrer);

  const messages: ChatMessage[] = [
    { role: "system", content: options.system },
    { role: "user", content: options.user },
  ];

  let lastError: Error = new PollinationsError("Pollinations request failed");
  let attempts = 0;

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    attempts = attempt;
    const body = {
      model: config.model,
      messages,
      response_format: { type: "json_object" },
      temperature: options.temperature ?? 0.25,
      max_tokens: maxTokens,
      seed,
      private: true,
      referrer: config.referrer,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const retryable = response.status === 429 || response.status >= 500;
        lastError = new PollinationsError(
          `Pollinations HTTP ${response.status}: ${text.slice(0, 300)}`,
          response.status,
        );
        if (!retryable) throw lastError;
        await backoff(attempt);
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      const payload: OpenAiResponse = contentType.includes("application/json")
        ? ((await response.json()) as OpenAiResponse)
        : { content: await response.text() };

      const content =
        payload.choices?.[0]?.message?.content ??
        payload.choices?.[0]?.text ??
        payload.content ??
        "";

      if (!content.trim()) {
        const finishReason = (payload as { choices?: { finish_reason?: string }[] })
          .choices?.[0]?.finish_reason;
        lastError = new PollinationsError(
          `Pollinations returned an empty answer${
            finishReason ? ` (finish_reason=${finishReason})` : ""
          }`,
        );
        // The anonymous endpoint caps output tokens server-side. Reasoning models
        // sometimes spend that whole budget on reasoning for a given seed, so both
        // the token budget and the seed are varied between attempts to get a
        // different (shorter) reasoning path.
        if (attempt <= retries) {
          maxTokens = Math.min(maxTokens * 3, 8000);
          seed += 7919;
        }
        await backoff(attempt);
        continue;
      }

      const data = extractJson<T>(content);
      if (data === null) {
        const finishReason = (payload as { choices?: { finish_reason?: string }[] })
          .choices?.[0]?.finish_reason;
        lastError = new PollinationsError(
          `Could not parse JSON from the model answer${
            finishReason ? ` (finish_reason=${finishReason})` : ""
          }: ${content.slice(0, 200)}`,
        );
        // Truncated answers (finish_reason=length) and stray commentary both fail
        // here; a bigger budget and a different seed give the model a fresh chance.
        if (attempt <= retries) {
          maxTokens = Math.min(maxTokens * 3, 8000);
          seed += 7919;
        }
        await backoff(attempt);
        continue;
      }

      return {
        data,
        model: payload.model || config.model,
        endpoint: config.endpoint,
        auth: config.auth,
        attempts,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      lastError =
        error instanceof Error ? error : new PollinationsError(String(error));
      if (attempt <= retries) {
        await backoff(attempt);
        continue;
      }
    }
  }

  throw lastError;
}

export interface HealthReport {
  ok: boolean;
  model: string;
  endpoint: string;
  auth: "api-key" | "anonymous";
  latencyMs: number;
  message: string;
}

/** Lightweight connectivity probe used by the UI status badge. */
export async function checkPollinations(): Promise<HealthReport> {
  const config = pollinationsConfig();
  const started = Date.now();
  try {
    const result = await chatJson<{ ok?: boolean; status?: string }>({
      system:
        'You are a connectivity probe. Reply with exactly {"ok":true,"status":"ready"}.',
      user: "Ping.",
      maxTokens: 60,
      timeoutMs: 25_000,
      retries: 1,
    });
    return {
      ok: Boolean(result.data?.ok ?? true),
      model: result.model,
      endpoint: result.endpoint,
      auth: result.auth,
      latencyMs: Date.now() - started,
      message: "Pollinations text API reachable.",
    };
  } catch (error) {
    return {
      ok: false,
      model: config.model,
      endpoint: config.endpoint,
      auth: config.auth,
      latencyMs: Date.now() - started,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function backoff(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
}
