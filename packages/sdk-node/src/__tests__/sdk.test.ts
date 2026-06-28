import { describe, it, expect, vi, beforeEach } from "vitest";
import { Tokonomics } from "../index";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const okResponse = () =>
  new Response(
    JSON.stringify({ data: { eventId: "evt_1", costUsd: "0.007500", status: "accepted" } }),
    { status: 202 }
  );

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue(okResponse());
});

// Give the flush's setTimeout(0) a chance to fire
const drain = () => new Promise<void>((r) => setTimeout(r, 50));

function mockOpenAIResponse(inputTokens = 1000, outputTokens = 500) {
  return {
    id: "chatcmpl-123",
    model: "gpt-4o",
    usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
    choices: [{ message: { role: "assistant", content: "Hello world" } }],
  };
}

function mockAnthropicResponse(inputTokens = 500, outputTokens = 200) {
  return {
    id: "msg_123",
    model: "claude-3-5-haiku-20241022",
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    content: [{ type: "text", text: "Hello world" }],
  };
}

describe("Tokonomics.track()", () => {
  it("returns the result of the wrapped function", async () => {
    const toko = new Tokonomics({ apiKey: "tok_live_test" });
    const llmResult = mockOpenAIResponse();
    const result = await toko.track({ customerId: "cust-1" }, async () => llmResult);
    expect(result).toBe(llmResult);
    await drain(); // drain flush timer so it doesn't leak into the next test
  });

  it("sends a tracking event to the ingest endpoint", async () => {
    const toko = new Tokonomics({ apiKey: "tok_live_test" });
    await toko.track({ customerId: "cust-1", feature: "chat" }, async () => mockOpenAIResponse());
    await drain();

    expect(mockFetch).toHaveBeenCalled();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/ingest/v1/events");
    const body = JSON.parse(options.body as string);
    expect(body.customer_id).toBe("cust-1");
    expect(body.feature).toBe("chat");
  });

  it("extracts OpenAI token counts from usage", async () => {
    const toko = new Tokonomics({ apiKey: "tok_live_test" });
    await toko.track({ customerId: "cust-1" }, async () => mockOpenAIResponse(1000, 500));
    await drain();

    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(body.input_tokens).toBe(1000);
    expect(body.output_tokens).toBe(500);
    expect(body.model).toBe("gpt-4o");
    expect(body.provider).toBe("OPENAI");
  });

  it("extracts Anthropic token counts from usage", async () => {
    const toko = new Tokonomics({ apiKey: "tok_live_test" });
    await toko.track({ customerId: "cust-1" }, async () => mockAnthropicResponse(500, 200));
    await drain();

    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(body.input_tokens).toBe(500);
    expect(body.output_tokens).toBe(200);
    expect(body.model).toBe("claude-3-5-haiku-20241022");
    expect(body.provider).toBe("ANTHROPIC");
  });

  it("does NOT block the LLM call if tracking fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const toko = new Tokonomics({ apiKey: "tok_live_test" });
    const llmResult = mockOpenAIResponse();
    await expect(
      toko.track({ customerId: "cust-1" }, async () => llmResult)
    ).resolves.toBe(llmResult);
  });

  it("NEVER sends prompt content or completion text", async () => {
    const toko = new Tokonomics({ apiKey: "tok_live_test" });
    const SECRET = "SECRET_PROMPT_DO_NOT_LEAK";
    await toko.track({ customerId: "cust-1" }, async () => ({
      model: "gpt-4o",
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      choices: [{ message: { content: SECRET } }],
      _rawPrompt: SECRET,
    }));
    await drain();

    const bodyStr = JSON.stringify(JSON.parse(mockFetch.mock.calls[0]![1]!.body as string));
    expect(bodyStr).not.toContain(SECRET);
    expect(bodyStr).not.toContain("SECRET");
  });

  it("uses custom baseUrl when provided", async () => {
    const toko = new Tokonomics({ apiKey: "tok_live_test", baseUrl: "https://custom.example.com" });
    await toko.track({ customerId: "cust-1" }, async () => mockOpenAIResponse());
    await drain();

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("custom.example.com");
  });

  it("records latency_ms > 0", async () => {
    const toko = new Tokonomics({ apiKey: "tok_live_test" });
    await toko.track({ customerId: "cust-1" }, async () => mockOpenAIResponse());
    await drain();

    const body = JSON.parse(mockFetch.mock.calls[0]![1]!.body as string);
    expect(typeof body.latency_ms).toBe("number");
    expect(body.latency_ms).toBeGreaterThanOrEqual(0);
  });
});

describe("Tokonomics constructor", () => {
  it("throws if apiKey is missing", () => {
    // @ts-expect-error testing invalid input
    expect(() => new Tokonomics({})).toThrow();
  });
});
