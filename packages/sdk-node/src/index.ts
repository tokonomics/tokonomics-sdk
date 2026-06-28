const DEFAULT_BASE_URL = "https://ingest.tokonomics.dev";
const SDK_VERSION = "0.1.0";
const MAX_QUEUE_SIZE = 1000;

type LlmProvider = "OPENAI" | "ANTHROPIC" | "GOOGLE";

type TrackContext = {
  customerId: string;
  feature?: string;
  workflow?: string;
};

type QueuedEvent = {
  payload: Record<string, unknown>;
  attempts: number;
  nextRetryAt: number;
};

type OpenAILike = {
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type AnthropicLike = {
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
};

function detectProvider(response: unknown): LlmProvider | null {
  if (!response || typeof response !== "object") return null;
  const r = response as Record<string, unknown>;

  const usage = r["usage"] as Record<string, unknown> | undefined;
  if (!usage) return null;

  if ("prompt_tokens" in usage || "completion_tokens" in usage) return "OPENAI";
  if ("input_tokens" in usage || "output_tokens" in usage) return "ANTHROPIC";

  return null;
}

function extractTokens(
  response: unknown,
  provider: LlmProvider
): { inputTokens: number; outputTokens: number; model: string } {
  const r = response as Record<string, unknown>;
  const usage = (r["usage"] as Record<string, unknown>) ?? {};
  const model = (r["model"] as string) ?? "unknown";

  if (provider === "OPENAI") {
    const oai = response as OpenAILike;
    return {
      inputTokens: oai.usage?.prompt_tokens ?? 0,
      outputTokens: oai.usage?.completion_tokens ?? 0,
      model,
    };
  }

  if (provider === "ANTHROPIC") {
    const ant = response as AnthropicLike;
    return {
      inputTokens: ant.usage?.input_tokens ?? 0,
      outputTokens: ant.usage?.output_tokens ?? 0,
      model,
    };
  }

  return { inputTokens: 0, outputTokens: 0, model };
}

export class Tokonomics {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly queue: QueuedEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: { apiKey: string; baseUrl?: string }) {
    if (!options.apiKey) throw new Error("Tokonomics: apiKey is required");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  /**
   * Wraps an LLM call, measures latency, extracts token counts, and sends a
   * tracking event. The underlying LLM call is NEVER blocked — if tracking
   * fails the error is swallowed and retried from the local queue.
   *
   * Prompt content and completion text are NEVER captured or transmitted.
   */
  async track<T>(context: TrackContext, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    const result = await fn();
    const latencyMs = Date.now() - start;

    // Extract metadata from the response — ONLY tokens/model, never content
    const provider = detectProvider(result);

    if (provider) {
      const { inputTokens, outputTokens, model } = extractTokens(result, provider);

      const payload: Record<string, unknown> = {
        customer_id: context.customerId,
        model,
        provider,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        latency_ms: latencyMs,
        sdk_version: SDK_VERSION,
      };
      if (context.feature) payload["feature"] = context.feature;
      if (context.workflow) payload["workflow"] = context.workflow;

      // Fire-and-forget — never blocks the caller
      this.enqueue(payload);
    }

    return result;
  }

  private enqueue(payload: Record<string, unknown>): void {
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      // Drop oldest event to prevent unbounded growth
      this.queue.shift();
    }

    this.queue.push({ payload, attempts: 0, nextRetryAt: 0 });
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, 0);
  }

  private async flush(): Promise<void> {
    const now = Date.now();
    const ready = this.queue.filter((e) => e.nextRetryAt <= now);

    for (const event of ready) {
      try {
        const res = await fetch(`${this.baseUrl}/ingest/v1/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(event.payload),
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok || res.status === 400) {
          // 400 = validation error, no point retrying
          const idx = this.queue.indexOf(event);
          if (idx !== -1) this.queue.splice(idx, 1);
        } else {
          this.scheduleRetry(event);
        }
      } catch {
        this.scheduleRetry(event);
      }
    }
  }

  private scheduleRetry(event: QueuedEvent): void {
    event.attempts += 1;
    if (event.attempts >= 5) {
      // Give up after 5 attempts
      const idx = this.queue.indexOf(event);
      if (idx !== -1) this.queue.splice(idx, 1);
      return;
    }
    // Exponential backoff: 1s, 2s, 4s, 8s
    event.nextRetryAt = Date.now() + Math.pow(2, event.attempts - 1) * 1000;
    this.scheduleFlush();
  }
}

export type { TrackContext };
